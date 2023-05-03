import {
	Stack,
	StackProps,
	CfnOutput,
	NestedStack,
	SecretValue,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
	UserPool,
	UserPoolClient,
	CfnIdentityPool,
	CfnIdentityPoolRoleAttachment,
} from 'aws-cdk-lib/aws-cognito';
import {
	Role,
	FederatedPrincipal,
	PolicyDocument,
	PolicyStatement,
	Effect,
} from 'aws-cdk-lib/aws-iam';
import {
	App,
	GitHubSourceCodeProvider,
	RedirectStatus,
} from '@aws-cdk/aws-amplify-alpha';
import * as config from '../config.json';

interface ClientStackProps extends StackProps {
	readonly firehoseArn: string;
	readonly firehoseName: string;
}

export class ClientStack extends NestedStack {
	public readonly userPoolId: CfnOutput;
	public readonly userPoolClientId: CfnOutput;
	public readonly identityPoolId: CfnOutput;

	constructor(scope: Construct, id: string, props: ClientStackProps) {
		super(scope, id, props);

		const userPool = new UserPool(this, `UserPoolFirehoseApp`, {
			selfSignUpEnabled: true, // Allow users to sign up
			autoVerify: { email: true }, // Verify email addresses by sending a verification code
			signInAliases: { email: true }, // Set email as an alias
		});

		const userPoolClient = new UserPoolClient(
			this,
			`UserPoolClientFirehoseApp`,
			{
				userPool,
				generateSecret: false, // Don't need to generate secret for web app running on browsers
			}
		);

		const identityPool = new CfnIdentityPool(this, `IdentityPoolFirehoseApp`, {
			allowUnauthenticatedIdentities: true,
			cognitoIdentityProviders: [
				{
					clientId: userPoolClient.userPoolClientId,
					providerName: userPool.userPoolProviderName,
				},
			],
		});

		const givePutAccessToFirehose = new PolicyDocument({
			statements: [
				new PolicyStatement({
					resources: [props.firehoseArn],
					actions: [
						'firehose:ListDeliveryStreams',
						'firehose:PutRecord',
						'firehose:PutRecordBatch',
					],
					effect: Effect.ALLOW,
				}),
			],
		});

		const isAnonymousCognitoGroupRole = new Role(
			this,
			`AnonymousGroupRoleFirehoseApp`,
			{
				description: 'Default role for anonymous users',
				assumedBy: new FederatedPrincipal(
					'cognito-identity.amazonaws.com',
					{
						StringEquals: {
							'cognito-identity.amazonaws.com:aud': identityPool.ref,
						},
						'ForAnyValue:StringLike': {
							'cognito-identity.amazonaws.com:amr': 'unauthenticated',
						},
					},
					'sts:AssumeRoleWithWebIdentity'
				),
				inlinePolicies: {
					givePutAccessToFirehose: givePutAccessToFirehose,
				},
			}
		);

		const isUserCognitoGroupRole = new Role(this, `UserGroupRoleFirehosepApp`, {
			description: 'Default role for authenticated users',
			assumedBy: new FederatedPrincipal(
				'cognito-identity.amazonaws.com',
				{
					StringEquals: {
						'cognito-identity.amazonaws.com:aud': identityPool.ref,
					},
					'ForAnyValue:StringLike': {
						'cognito-identity.amazonaws.com:amr': 'authenticated',
					},
				},
				'sts:AssumeRoleWithWebIdentity'
			),
			inlinePolicies: {
				givePutAccessToFirehose: givePutAccessToFirehose,
			},
		});

		new CfnIdentityPoolRoleAttachment(
			this,
			`IdentityPoolRoleAttachmentFirehoseApp`,
			{
				identityPoolId: identityPool.ref,
				roles: {
					authenticated: isUserCognitoGroupRole.roleArn,
					unauthenticated: isAnonymousCognitoGroupRole.roleArn,
				},
				roleMappings: {
					mapping: {
						type: 'Token',
						ambiguousRoleResolution: 'AuthenticatedRole',
						identityProvider: `cognito-idp.${
							Stack.of(this).region
						}.amazonaws.com/${userPool.userPoolId}:${
							userPoolClient.userPoolClientId
						}`,
					},
				},
			}
		);

		this.userPoolId = new CfnOutput(this, 'OutputUserPoolFirehoseApp', {
			value: userPool.userPoolId,
		});
		this.userPoolClientId = new CfnOutput(
			this,
			'OutputUserPoolClientFirehoseApp',
			{
				value: userPoolClient.userPoolClientId,
			}
		);
		this.identityPoolId = new CfnOutput(this, 'OutputIdentityPoolFirehoseApp', {
			value: identityPool.ref,
		});

		//Amplify app
		const amplifyApp = new App(this, `AmplifyFirehoseApp`, {
			sourceCodeProvider: new GitHubSourceCodeProvider({
				owner: config.frontend.owner,
				repository: config.frontend.repository_name,
				oauthToken: SecretValue.secretsManager('github-token'),
			}),
			environmentVariables: {
				REGION: this.region,
				IDENTITY_POOL_ID: identityPool.ref,
				USER_POOL_ID: userPool.userPoolId,
				USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
				FIREHOSE_NAME: props.firehoseName || '',
			},
		});

		const mainBranch = amplifyApp.addBranch('main');

		amplifyApp.addCustomRule({
			source:
				'</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>',
			target: '/index.html',
			status: RedirectStatus.REWRITE,
		});

		new CfnOutput(this, 'AmplifyFirehoseAppName', {
			value: amplifyApp.appName,
		});

		new CfnOutput(this, 'AmplifyFirehoseAppId', {
			value: amplifyApp.appId,
		});

		new CfnOutput(this, 'AmplifyFirehoseURL', {
			value: `https://main.${amplifyApp.defaultDomain}`,
		});
	}
}
