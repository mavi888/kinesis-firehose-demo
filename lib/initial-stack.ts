import { Database } from '@aws-cdk/aws-glue-alpha';
import { CfnOutput, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import {
	Effect,
	PolicyDocument,
	PolicyStatement,
	Role,
	ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import { LogGroup, LogStream, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Bucket } from 'aws-cdk-lib/aws-s3';

import { Construct } from 'constructs';

export class InitialStack extends Stack {
	public readonly firehoseDestinationBucketName: CfnOutput;
	public readonly firehoseDestinationBucketArn: CfnOutput;
	public readonly glueDatabaseName: CfnOutput;
	public readonly glueDatabaseArn: CfnOutput;
	public readonly kinesisFirehoseRoleArn: CfnOutput;
	public readonly logGroupName: CfnOutput;
	public readonly logStreamName: CfnOutput;

	constructor(scope: Construct, id: string, props: StackProps) {
		super(scope, id, props);

		// Kinesis Firehose destination bucket
		const firehoseDestinationBucket = new Bucket(this, 'DestinationBucket', {
			removalPolicy: RemovalPolicy.DESTROY,
			autoDeleteObjects: true,
		});

		// Glue database
		const glueDatabase = new Database(this, 'GlueDatabase', {
			databaseName: 'glue-database',
		});

		// log group for kinesis firehose errors
		const logGroup = new LogGroup(this, 'KinesisFirehoseLogGroup', {
			logGroupName: 'KinesisFirehoseLogGroup',
			removalPolicy: RemovalPolicy.DESTROY,
			retention: RetentionDays.FIVE_DAYS,
		});

		// create a log stream for firehose
		const logStream = new LogStream(this, 'KinesisFirehoseLogStream', {
			logGroup: logGroup,
			logStreamName: 'KinesisFirehoseLogStream',
			removalPolicy: RemovalPolicy.DESTROY,
		});

		// give permissions to firehose to put logs
		const cloudWatchPolicy = new PolicyDocument({
			statements: [
				new PolicyStatement({
					actions: ['logs:PutLogEvents'],
					effect: Effect.ALLOW,
					resources: [
						`${logGroup.logGroupArn}:log-stream:${logStream.logStreamName}`,
					],
				}),
			],
		});

		const gluePolicy = new PolicyDocument({
			statements: [
				new PolicyStatement({
					effect: Effect.ALLOW,
					actions: [
						'glue:GetDatabase',
						'glue:GetTable',
						'glue:GetTableVersion',
						'glue:GetTableVersions',
					],
					resources: ['*'],
				}),
			],
		});

		// IAM Role for Kinesis firehose
		const kinesisfirehoseRole = new Role(this, 'KinesisFirehoseRole', {
			roleName: 'kinesis-firese-role',
			assumedBy: new ServicePrincipal('firehose.amazonaws.com'),
			inlinePolicies: {
				cloudWatchPolicy,
				gluePolicy,
			},
		});

		// Grant permissions to the role to put objects in the bucket
		firehoseDestinationBucket.grantPut(kinesisfirehoseRole);
		firehoseDestinationBucket.grantWrite(kinesisfirehoseRole);

		// Outputs used in other stacks
		this.firehoseDestinationBucketName = new CfnOutput(
			this,
			'FirehoseDestinationBucketName',
			{
				value: firehoseDestinationBucket.bucketName || '',
			}
		);

		this.firehoseDestinationBucketArn = new CfnOutput(
			this,
			'FirehoseDestinationBucketArn',
			{
				value: firehoseDestinationBucket.bucketArn || '',
			}
		);

		this.glueDatabaseName = new CfnOutput(this, 'GlueDatabaseName', {
			value: glueDatabase.databaseName,
		});

		this.glueDatabaseArn = new CfnOutput(this, 'GlueDatabaseArn', {
			value: glueDatabase.databaseArn,
		});
		this.kinesisFirehoseRoleArn = new CfnOutput(
			this,
			'KinesisFirehoseRoleArn',
			{
				value: kinesisfirehoseRole.roleArn,
			}
		);

		this.logGroupName = new CfnOutput(this, 'LogGroupName', {
			value: logGroup.logGroupName,
		});

		this.logStreamName = new CfnOutput(this, 'LogStreamName', {
			value: logStream.logStreamName,
		});
	}
}
