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
 * Docker 容器资源使用
 */
export interface DockerStats {
  container: string;
  cpuPercent: number;
  memoryUsed: number; // bytes
  memoryTotal: number; // bytes
  networkRx: number; // bytes
  networkTx: number; // bytes
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
