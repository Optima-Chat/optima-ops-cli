import inquirer from 'inquirer';
import { Environment } from './config.js';

// ============== 交互式判断 ==============

/**
 * 判断是否在交互式环境中
 */
export function isInteractive(): boolean {
  // 非交互式标志
  if (process.env.NON_INTERACTIVE === '1' || process.env.OPTIMA_NON_INTERACTIVE === 'true') {
    return false;
  }

  // CI 环境
  if (process.env.CI === 'true') {
    return false;
  }

  // 没有 TTY
  if (!process.stdin.isTTY) {
    return false;
  }

  return true;
}

// ============== 通用提示 ==============

/**
 * 确认提示
 */
export async function confirmPrompt(message: string, defaultValue = false): Promise<boolean> {
  if (!isInteractive()) {
    throw new Error('需要确认操作，请使用 --yes 标志或在交互式终端中运行');
  }

  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message,
      default: defaultValue,
    },
  ]);

  return confirmed;
}

/**
 * 选择提示
 */
export async function selectPrompt<T extends string>(
  message: string,
  choices: Array<{ name: string; value: T }>,
  defaultValue?: T
): Promise<T> {
  if (!isInteractive()) {
    throw new Error('需要选择选项，请在命令行中指定参数或在交互式终端中运行');
  }

  const { selected } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selected',
      message,
      choices,
      default: defaultValue,
      pageSize: 10,
    },
  ]);

  return selected;
}

/**
 * 多选提示
 */
export async function multiSelectPrompt<T extends string>(
  message: string,
  choices: Array<{ name: string; value: T; checked?: boolean }>
): Promise<T[]> {
  if (!isInteractive()) {
    throw new Error('需要选择选项，请在命令行中指定参数或在交互式终端中运行');
  }

  const { selected } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selected',
      message,
      choices,
      pageSize: 10,
    },
  ]);

  return selected;
}

/**
 * 输入提示
 */
export async function inputPrompt(
  message: string,
  defaultValue?: string,
  validate?: (input: string) => boolean | string
): Promise<string> {
  if (!isInteractive()) {
    throw new Error('需要输入内容，请在命令行中指定参数或在交互式终端中运行');
  }

  const { input } = await inquirer.prompt([
    {
      type: 'input',
      name: 'input',
      message,
      default: defaultValue,
      validate,
    },
  ]);

  return input;
}

// ============== 特定领域提示 ==============

/**
 * 选择环境
 */
export async function selectEnvironment(message = '选择环境:', defaultEnv?: Environment): Promise<Environment> {
  return selectPrompt(message, [
    { name: 'Production (生产环境)', value: 'production' },
    { name: 'Stage (预发布环境)', value: 'stage' },
    { name: 'Development (开发环境)', value: 'development' },
  ], defaultEnv);
}

/**
 * 选择服务
 */
export async function selectService(
  services: string[],
  message = '选择服务:',
  defaultService?: string
): Promise<string> {
  const choices = services.map(service => ({
    name: service,
    value: service,
  }));

  return selectPrompt(message, choices, defaultService);
}

/**
 * 选择多个服务
 */
export async function selectMultipleServices(
  services: string[],
  message = '选择服务（可多选）:',
  checkedServices?: string[]
): Promise<string[]> {
  const choices = services.map(service => ({
    name: service,
    value: service,
    checked: checkedServices?.includes(service) || false,
  }));

  return multiSelectPrompt(message, choices);
}

/**
 * 选择数据库
 */
export async function selectDatabase(
  databases: Array<{ name: string; size?: string }>,
  message = '选择数据库:'
): Promise<string> {
  const choices = databases.map(db => ({
    name: db.size ? `${db.name} (${db.size})` : db.name,
    value: db.name,
  }));

  return selectPrompt(message, choices);
}

/**
 * 选择表
 */
export async function selectTable(
  tables: string[],
  message = '选择表:',
  defaultTable?: string
): Promise<string> {
  const choices = tables.map(table => ({
    name: table,
    value: table,
  }));

  return selectPrompt(message, choices, defaultTable);
}

/**
 * 确认危险操作
 */
export async function confirmDangerousAction(
  action: string,
  target: string,
  env: Environment
): Promise<boolean> {
  if (!isInteractive()) {
    throw new Error(`危险操作需要确认: ${action} (${target}) 在 ${env} 环境。请使用 --yes 标志或在交互式终端中运行`);
  }

  console.log(`\n⚠️  即将执行危险操作:`);
  console.log(`   操作: ${action}`);
  console.log(`   目标: ${target}`);
  console.log(`   环境: ${env}`);
  console.log();

  return confirmPrompt('确定要继续吗？', false);
}

// ============== Prompt Helper Class ==============

/**
 * PromptHelper 类提供统一的提示接口
 */
export class PromptHelper {
  static inputText = inputPrompt;
  static select = selectPrompt;
  static multiSelect = multiSelectPrompt;
  static confirm = confirmPrompt;
  static selectEnvironment = selectEnvironment;
  static selectService = selectService;
  static selectMultipleServices = selectMultipleServices;
  static selectDatabase = selectDatabase;
  static selectTable = selectTable;
  static confirmDangerousAction = confirmDangerousAction;
  static isInteractive = isInteractive;
}
