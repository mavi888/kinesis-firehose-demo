import { Stack, StackProps } from 'aws-cdk-lib';
import { CfnCrawler } from 'aws-cdk-lib/aws-glue';
import {
	Effect,
	ManagedPolicy,
	PolicyDocument,
	PolicyStatement,
	Role,
	ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

interface CrawlerStackProps extends StackProps {
	readonly firehoseDestinationBucketArn: string;
	readonly firehoseDestinationBucketName: string;
	readonly glueDatabaseName: string;
}

export class CrawlerStack extends Stack {
	constructor(scope: Construct, id: string, props: CrawlerStackProps) {
		super(scope, id, props);

		const s3ReadBucketPolicy = new PolicyDocument({
			statements: [
				new PolicyStatement({
					actions: [
						's3:GetObject',
						's3:PutObject',
						's3:DeleteObject',
						's3:ListBucket',
					],
					effect: Effect.ALLOW,
					resources: [
						props.firehoseDestinationBucketArn,
						props.firehoseDestinationBucketArn + '/*',
					],
				}),
			],
		});

		const crawlerRole = new Role(this, 'CrawlerRole', {
			roleName: 'glue-crawler-role',
			managedPolicies: [
				ManagedPolicy.fromManagedPolicyArn(
					this,
					'glue-service-policy',
					'arn:aws:iam::aws:policy/service-role/AWSGlueServiceRole'
				),
			],
			inlinePolicies: {
				s3ReadBucketPolicy,
			},
			assumedBy: new ServicePrincipal('glue.amazonaws.com'),
		});

		// Glue crawlers to populate the Glue database
		const crawler = new CfnCrawler(this, 'Crawler', {
			name: 'crawler-automatic-new',
			role: crawlerRole.roleArn,
			databaseName: props.glueDatabaseName,
			schedule: {
				scheduleExpression: 'cron(0 * * * ? *)', // a cron expression at 0 in the hour
			},
			targets: {
				s3Targets: [
					{
						path: `s3://${props.firehoseDestinationBucketName}/input/`,
					},
				],
			},
			schemaChangePolicy: {
				updateBehavior: 'UPDATE_IN_DATABASE',
				deleteBehavior: 'DELETE_FROM_DATABASE',
			},
		});
	}
}
