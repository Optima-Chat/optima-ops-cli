import { Command } from 'commander';
import { handleError } from '../../utils/error.js';

export const dashboardCommand = new Command('dashboard')
  .description('Launch interactive TUI monitoring dashboard')
  .option('--env <environment>', 'Environment to monitor', 'production')
  .option('--interval <seconds>', 'Refresh interval in seconds', '5')
  .action(async (options) => {
    try {
      // 动态导入 ink 和 React (避免影响其他命令启动速度)
      const { render } = await import('ink');
      const React = await import('react');
      const { App } = await import('../../ui/App.js');

      // 渲染 TUI
      const { waitUntilExit } = render(
        React.createElement(App, {
          environment: options.env,
          interval: parseInt(options.interval, 10),
        }),
      );

      // 等待用户退出
      await waitUntilExit();
    } catch (error) {
      handleError(error);
      process.exit(1);
    }
  });
