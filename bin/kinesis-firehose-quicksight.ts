#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { KinesisFirehoseQuicksightStack } from '../lib/kinesis-firehose-quicksight-stack';
import { CrawlerStack } from '../lib/crawler-stack';
import { InitialStack } from '../lib/initial-stack';

const app = new cdk.App();

const initialStack = new InitialStack(app, 'InitialStack', {});

// Upload the test data to the bucket and then run the crawler
// input / 2023 / 05 / 05 / 08 / file

const crawlerStack = new CrawlerStack(app, 'CrawlerStack', {
	firehoseDestinationBucketArn: initialStack.firehoseDestinationBucketArn.value,
	firehoseDestinationBucketName:
		initialStack.firehoseDestinationBucketName.value,
	glueDatabaseName: initialStack.glueDatabaseName.value,
});

// Need to run the crawler in the Glue Console, then I can proceed with the other deployments...
// to generate the tables

const kinesisFirehose = new KinesisFirehoseQuicksightStack(
	app,
	'KinesisFirehoseStack',
	{
		firehoseDestinationBucketArn:
			initialStack.firehoseDestinationBucketArn.value,
		glueDatabaseArn: initialStack.glueDatabaseArn.value,
		glueTableArn: `${initialStack.glueDatabaseArn.value}/input`,
		kinesisFirehoseRoleArn: initialStack.kinesisFirehoseRoleArn.value,
		logGroupName: initialStack.logGroupName.value,
		logStreamName: initialStack.logStreamName.value,
	}
);

// Before sending any data remove the dummmy data s
// 11:57 - others --> 11:59 in S3 and then imediately in QS
