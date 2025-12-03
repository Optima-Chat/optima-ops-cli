// Monitor module types

/**
 * 单环境健康状态
 */
export interface EnvironmentHealth {
  health: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number; // ms
  containerStatus: string;
  uptime?: string; // 容器运行时长
  // 构建信息（从容器 labels 读取）
  buildCommit?: string; // Git commit SHA
  buildBranch?: string; // Git 分支
  buildTag?: string; // Git tag（如 v1.2.3）
  buildWorkflow?: string; // GitHub workflow 名称
  buildTime?: string; // 构建时间
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
  buildTag?: string; // Git tag（如 v1.2.3）
  buildWorkflow?: string; // GitHub workflow 名称
  buildTime?: string; // 构建时间
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
  ec2: EC2Stats[];
}

/**
 * ECS 服务状态
 */
export interface ECSServiceStats {
  serviceName: string;
  clusterName: string;
  runningCount: number;
  desiredCount: number;
  pendingCount: number;
  cpuUtilization?: number; // CloudWatch metric
  memoryUtilization?: number; // CloudWatch metric
  status: 'ACTIVE' | 'DRAINING' | 'INACTIVE';
  deploymentStatus?: string;
  lastDeployment?: Date;
}

/**
 * Docker 容器资源使用（TUI 简化版）
 */
export interface DockerStats {
  container: string;
  cpuPercent: number;
  memoryUsed: number;
  memoryTotal: number;
  networkRx: number;
  networkTx: number;
}

/**
 * 蓝绿部署任务信息
 */
export interface BlueGreenTaskInfo {
  taskId: string;
  status: string;
  health: 'healthy' | 'unhealthy' | 'unknown';
}

/**
 * 蓝绿部署目标组状态
 */
export interface BlueGreenTargetInfo {
  running: number;
  desired: number;
  tasks?: BlueGreenTaskInfo[];
}

/**
 * 蓝绿部署状态
 */
export interface BlueGreenStatus {
  service: string;
  blue: BlueGreenTargetInfo;
  green: BlueGreenTargetInfo;
  traffic: {
    blue: number;
    green: number;
  };
}

/**
 * Panel 类型
 */
export type PanelType = 'overview' | 'services' | 'ec2' | 'ecs';

/**
 * Panel 配置
 */
export interface PanelConfig {
  type: PanelType;
  key: string; // 键盘快捷键 (0-3)
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
    ecs?: ECSServiceStats[];
  };
}
