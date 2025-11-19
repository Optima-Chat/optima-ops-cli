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

  // 扩展信息
  status?: string; // running, exited, etc.
  uptime?: string; // 运行时长，如 "2 days ago"
  startedAt?: string; // 启动时间
  imageTag?: string; // 镜像标签，如 "v1.2.3"
  imageId?: string; // 镜像 ID（短格式）

  // 构建信息（从镜像 labels 读取）
  buildCommit?: string; // Git commit SHA
  buildBranch?: string; // Git 分支
  buildWorkflow?: string; // GitHub workflow 名称
  buildTime?: string; // 构建时间
}

/**
 * Docker 容器资源使用（多环境）
 */
export interface DockerStats {
  environment: 'production' | 'stage' | 'shared';
  stats: ContainerStats[];
  error?: string; // 获取失败时的错误信息
  offline?: boolean; // 标记环境是否离线
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
  environment: 'production' | 'stage' | 'shared';
  instanceId: string;
  instanceType: string;
  cpuUsage?: number;
  memoryUsed: number; // MB
  memoryTotal: number; // MB
  diskUsed: number; // GB (Root 卷，保留向后兼容)
  diskTotal: number; // GB (Root 卷)
  disks?: DiskStats[]; // 所有磁盘分区
  uptime: string;
  error?: string; // 获取失败时的错误信息
  offline?: boolean; // 标记环境是否离线
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

/**
 * Target Group 信息（用于蓝绿部署）
 */
export interface TargetGroupInfo {
  name: string;
  arn: string;
  port: number;
  healthyCount: number;
  unhealthyCount: number;
  drainingCount: number;
  weight: number; // 流量权重 0-100
}

/**
 * 蓝绿部署详细信息
 */
export interface BlueGreenDeployment {
  service: string;
  environment: 'production' | 'stage';
  subdomain: string;
  blueTargetGroup: TargetGroupInfo;
  greenTargetGroup: TargetGroupInfo;
  totalTraffic: {
    blue: number;
    green: number;
  };
  status: 'blue-only' | 'green-only' | 'canary' | 'split';
  lastDeployment?: {
    timestamp: Date;
    version: string;
    type: 'blue' | 'green';
  };
}

/**
 * Panel 类型
 */
export type PanelType = 'overview' | 'services' | 'ec2' | 'docker' | 'bluegreen';

/**
 * Panel 配置
 */
export interface PanelConfig {
  type: PanelType;
  key: string; // 键盘快捷键 (0-4)
  label: string;
  description: string;
  refreshInterval: number; // 毫秒
}

/**
 * Dashboard 状态
 */
export interface DashboardState {
  currentPanel: PanelType;
  lastRefresh: Map<PanelType, Date>;
  cachedData: {
    services?: ServiceHealth[];
    ec2?: EC2Stats[];
    docker?: DockerStats[];
    blueGreen?: BlueGreenDeployment[];
  };
}
