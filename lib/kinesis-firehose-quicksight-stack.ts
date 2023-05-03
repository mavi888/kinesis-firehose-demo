import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { CfnDeliveryStream } from 'aws-cdk-lib/aws-kinesisfirehose';
import { Construct } from 'constructs';
import { ClientStack } from './client-stack';
import { Database, Table } from '@aws-cdk/aws-glue-alpha';

interface KinesisFirehoseQuicksightStackProps extends StackProps {
	readonly firehoseDestinationBucketArn: string;
	readonly glueDatabaseArn: string;
	readonly glueTableArn: string;
	readonly kinesisFirehoseRoleArn: string;
	readonly logGroupName: string;
	readonly logStreamName: string;
}

export class KinesisFirehoseQuicksightStack extends Stack {
	clientStack: ClientStack;

	constructor(
		scope: Construct,
		id: string,
		props: KinesisFirehoseQuicksightStackProps
	) {
		super(scope, id, props);

		// Get the Glue tables and databases created previously
		const glueDatabase = Database.fromDatabaseArn(
			this,
			'GlueDatabase',
			props.glueDatabaseArn
		);

		const glueTable = Table.fromTableArn(this, 'GlueTable', props.glueTableArn);

		// Create the kinesis firehose
		// No L2 constructor available: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_kinesisfirehose-readme.html
		const kinesisFirehoseDeliveryStream = new CfnDeliveryStream(
			this,
			'KinesisFirehoseDeliveryStream',
			{
				deliveryStreamName: 'KinesisFirehoseDeliveryStream',
				deliveryStreamType: 'DirectPut',
				extendedS3DestinationConfiguration: {
					bucketArn: props.firehoseDestinationBucketArn,
					roleArn: props.kinesisFirehoseRoleArn,
					prefix: 'input/',
					errorOutputPrefix: 'error/',
					cloudWatchLoggingOptions: {
						enabled: true,
						logGroupName: props.logGroupName,
						logStreamName: props.logStreamName,
					},
					bufferingHints: {
						sizeInMBs: 128,
						intervalInSeconds: 300,
					},
					dataFormatConversionConfiguration: {
						enabled: true,
						inputFormatConfiguration: {
							deserializer: {
								hiveJsonSerDe: {},
							},
						},
						outputFormatConfiguration: {
							serializer: {
								parquetSerDe: {},
							},
						},
						schemaConfiguration: {
							databaseName: glueDatabase.databaseName,
							tableName: glueTable.tableName,
							roleArn: props.kinesisFirehoseRoleArn,
						},
					},
				},
			}
		);

		new CfnOutput(this, 'FirehoseName', {
			value: kinesisFirehoseDeliveryStream.deliveryStreamName || '',
		});

		// --- CLIENT FOR DATA INGESTION
		//Create the cognito user pool, identity pool and client with permissions to unauth users to put messages in firehose
		// Create the amplify application with that information
		this.clientStack = new ClientStack(this, 'ClientStack', {
			firehoseArn: kinesisFirehoseDeliveryStream.attrArn,
			firehoseName: kinesisFirehoseDeliveryStream.deliveryStreamName || '',
		});
	}
}
