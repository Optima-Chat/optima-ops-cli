// Monitor module types

import type { ECSTaskInfo } from '../services/aws/ecs-service.js';
import type { TrafficSplit } from '../services/aws/alb-service.js';

/**
 * 单环境健康状态
 */
export interface EnvironmentHealth {
  health: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number; // ms
  containerStatus: string;
  error?: string;
}

/**
 * 服务健康状态（包含多环境）
 */
export interface ServiceHealth {
  name: string;
  type: 'core' | 'mcp';
  prod: EnvironmentHealth;
  stage?: EnvironmentHealth;
}

/**
 * 蓝绿部署状态
 */
export interface BlueGreenStatus {
  service: string;
  blue: ECSTaskInfo;
  green: ECSTaskInfo;
  traffic: TrafficSplit;
}

/**
 * 单个容器资源使用
 */
export interface ContainerStats {
  container: string;
  cpuPercent: number;
  memoryUsed: number; // bytes
  memoryTotal: number; // bytes
  networkRx: number; // bytes
  networkTx: number; // bytes
}

/**
 * Docker 容器资源使用（多环境）
 */
export interface DockerStats {
  environment: 'production' | 'stage';
  stats: ContainerStats[];
}

/**
 * 磁盘使用情况
 */
export interface DiskStats {
  mountPoint: string;
  used: number; // GB
  total: number; // GB
  percent: number;
}

/**
 * EC2 资源使用
 */
export interface EC2Stats {
  environment: 'production' | 'stage';
  instanceId: string;
  instanceType: string;
  cpuUsage?: number;
  memoryUsed: number; // MB
  memoryTotal: number; // MB
  diskUsed: number; // GB (Root 卷，保留向后兼容)
  diskTotal: number; // GB (Root 卷)
  disks?: DiskStats[]; // 所有磁盘分区
  uptime: string;
}

/**
 * 监控数据聚合
 */
export interface MonitorData {
  timestamp: Date;
  services: ServiceHealth[];
  blueGreen: BlueGreenStatus[];
  docker: DockerStats[];
}
