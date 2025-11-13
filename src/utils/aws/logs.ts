import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  DescribeLogStreamsCommand,
  GetLogEventsCommand,
  FilterLogEventsCommand,
  LogGroup,
  LogStream,
  OutputLogEvent,
} from '@aws-sdk/client-cloudwatch-logs';
import { getAWSRegion } from '../config.js';
import { AWSError } from '../error.js';

// ============== CloudWatch Logs 客户端 ==============

/**
 * 创建 CloudWatch Logs 客户端
 */
export function createLogsClient(): CloudWatchLogsClient {
  const region = getAWSRegion();
  return new CloudWatchLogsClient({ region });
}

/**
 * 获取日志组列表
 */
export async function getLogGroups(prefix?: string): Promise<LogGroup[]> {
  const client = createLogsClient();

  try {
    const command = new DescribeLogGroupsCommand({
      logGroupNamePrefix: prefix,
    });

    const response = await client.send(command);
    return response.logGroups || [];
  } catch (error: any) {
    throw new AWSError(
      '无法获取日志组列表',
      { prefix, error: error.message }
    );
  }
}

/**
 * 获取日志流列表
 */
export async function getLogStreams(
  logGroupName: string,
  limit = 50
): Promise<LogStream[]> {
  const client = createLogsClient();

  try {
    const command = new DescribeLogStreamsCommand({
      logGroupName,
      orderBy: 'LastEventTime',
      descending: true,
      limit,
    });

    const response = await client.send(command);
    return response.logStreams || [];
  } catch (error: any) {
    throw new AWSError(
      `无法获取日志流列表: ${logGroupName}`,
      { logGroupName, error: error.message }
    );
  }
}

/**
 * 获取日志事件
 */
export async function getLogEvents(
  logGroupName: string,
  logStreamName: string,
  options?: {
    startTime?: number;
    endTime?: number;
    limit?: number;
  }
): Promise<OutputLogEvent[]> {
  const client = createLogsClient();

  try {
    const command = new GetLogEventsCommand({
      logGroupName,
      logStreamName,
      startTime: options?.startTime,
      endTime: options?.endTime,
      limit: options?.limit || 100,
      startFromHead: false, // 从最新的开始
    });

    const response = await client.send(command);
    return response.events || [];
  } catch (error: any) {
    throw new AWSError(
      `无法获取日志事件: ${logGroupName}/${logStreamName}`,
      { logGroupName, logStreamName, error: error.message }
    );
  }
}

/**
 * 搜索日志
 */
export async function searchLogs(
  logGroupName: string,
  filterPattern: string,
  options?: {
    startTime?: number;
    endTime?: number;
    limit?: number;
  }
): Promise<OutputLogEvent[]> {
  const client = createLogsClient();

  try {
    const command = new FilterLogEventsCommand({
      logGroupName,
      filterPattern,
      startTime: options?.startTime,
      endTime: options?.endTime,
      limit: options?.limit || 100,
    });

    const response = await client.send(command);
    return response.events || [];
  } catch (error: any) {
    throw new AWSError(
      `无法搜索日志: ${logGroupName}`,
      { logGroupName, filterPattern, error: error.message }
    );
  }
}

/**
 * 获取最近的错误日志
 */
export async function getRecentErrors(
  logGroupName: string,
  minutes = 60,
  limit = 50
): Promise<OutputLogEvent[]> {
  const endTime = Date.now();
  const startTime = endTime - minutes * 60 * 1000;

  return searchLogs(logGroupName, 'ERROR', {
    startTime,
    endTime,
    limit,
  });
}
