import { readFileSync, existsSync } from 'fs';
import yaml from 'js-yaml';

/**
 * 配置规范中的变量定义
 */
export interface VariableSpec {
  type: 'secret' | 'config' | 'build_arg';
  required: boolean;
  description: string;
  format: 'string' | 'url' | 'email' | 'integer' | 'boolean' | 'json_array' | 'enum' | 'path';
  default?: string | number | boolean;
  example?: string;
  env_specific?: boolean;  // 不同环境值应该不同
  container?: string;  // 仅特定容器使用

  // SSM 映射和转换
  ssm_param?: string;  // SSM 参数名（如果与环境变量名不同）
  ssm_unit?: 'minutes' | 'days' | 'hours';  // SSM 中的单位
  transform?: string;  // 转换逻辑，如 "multiply(60)"
  ssm_sync?: boolean;  // 是否同步到 SSM（默认 true）

  // 替代参数（用于配置合并/迁移）
  replaces?: string[];  // 此参数替代哪些旧参数

  // 容器路径标记
  container_path?: boolean;  // 是否是容器内路径
  build_time?: boolean;  // 是否是构建时参数

  // 验证规则
  validation?: Record<string, string>;  // 环境特定验证规则
  min_length?: number;
  starts_with?: string;
  allowed_values?: string[];
}

/**
 * 已废弃参数定义
 */
export interface DeprecatedVariable {
  reason: string;
  removed_in: string;
  replaced_by?: string;
}

/**
 * 配置源定义
 */
export interface ConfigSource {
  primary: 'aws_ssm' | 'infisical' | 'github';
  path?: string;
  project?: string;
  environment?: string;
  secondary?: string | null;
}

/**
 * Docker Compose 配置
 */
export interface DockerComposeSpec {
  container_name: string;
  environment: string[];
  build_args?: string[];
}

/**
 * 完整的配置规范
 */
export interface ConfigSpec {
  service: string;
  version: string;
  last_updated: string;
  variables: Record<string, VariableSpec>;
  deprecated?: Record<string, DeprecatedVariable>;
  config_sources?: Record<string, ConfigSource>;
  docker_compose?: Record<string, DockerComposeSpec>;
  validation_rules?: Record<string, Record<string, string>>;
}

/**
 * 加载服务的 config-spec.yaml
 */
export function loadConfigSpec(servicePath: string): ConfigSpec {
  const specPath = `${servicePath}/config-spec.yaml`;

  if (!existsSync(specPath)) {
    throw new Error(`配置规范文件不存在: ${specPath}`);
  }

  try {
    const content = readFileSync(specPath, 'utf-8');
    const spec = yaml.load(content) as ConfigSpec;

    // 验证规范格式
    if (!spec.service || !spec.variables) {
      throw new Error('config-spec.yaml 格式错误：缺少 service 或 variables 字段');
    }

    return spec;
  } catch (error: any) {
    throw new Error(`加载配置规范失败: ${error.message}`);
  }
}

/**
 * 获取必需的环境变量列表
 */
export function getRequiredVariables(spec: ConfigSpec): string[] {
  return Object.entries(spec.variables)
    .filter(([_, varSpec]) => varSpec.required)
    .map(([name, _]) => name);
}

/**
 * 获取环境特定的变量列表
 */
export function getEnvSpecificVariables(spec: ConfigSpec): string[] {
  return Object.entries(spec.variables)
    .filter(([_, varSpec]) => varSpec.env_specific === true)
    .map(([name, _]) => name);
}

/**
 * 获取敏感参数列表
 */
export function getSensitiveVariables(spec: ConfigSpec): string[] {
  return Object.entries(spec.variables)
    .filter(([_, varSpec]) => varSpec.type === 'secret')
    .map(([name, _]) => name);
}

/**
 * 获取已废弃的参数列表
 */
export function getDeprecatedVariables(spec: ConfigSpec): string[] {
  if (!spec.deprecated) return [];
  return Object.keys(spec.deprecated);
}

/**
 * 应用 SSM 参数转换
 * 例如：从分钟转换为秒
 */
export function transformValue(value: string | number, varSpec: VariableSpec): string | number {
  if (!varSpec.transform || typeof value !== 'number') {
    return value;
  }

  // 解析 transform 表达式
  // 目前只支持简单的 multiply
  const match = varSpec.transform.match(/multiply\((\d+)\)/);
  if (match) {
    const multiplier = parseInt(match[1]);
    return value * multiplier;
  }

  return value;
}

/**
 * 获取 SSM 参数名（处理命名差异）
 */
export function getSSMParamName(varName: string, varSpec: VariableSpec): string {
  if (varSpec.ssm_param) {
    return varSpec.ssm_param;
  }
  // 默认：将 UPPER_SNAKE_CASE 转换为 kebab-case
  return varName.toLowerCase().replace(/_/g, '-');
}
