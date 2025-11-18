// Monitor command types

export interface MonitorOptions {
  env: string;
  interval: number;
}

export interface DashboardProps {
  environment: string;
  refreshInterval: number;
}
