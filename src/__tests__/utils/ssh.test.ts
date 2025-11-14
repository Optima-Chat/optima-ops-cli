/**
 * SSH 命令验证测试
 */

import { validateCommand } from '../../utils/ssh.js';

describe('utils/ssh - validateCommand', () => {
  describe('只读命令（应该通过）', () => {
    it('should allow docker ps commands', () => {
      expect(validateCommand('docker ps')).toEqual({ safe: true });
      expect(validateCommand('docker ps -a')).toEqual({ safe: true });
      expect(validateCommand('docker ps --all')).toEqual({ safe: true });
    });

    it('should allow docker logs commands', () => {
      expect(validateCommand('docker logs container-name')).toEqual({ safe: true });
      expect(validateCommand('docker logs --tail 100 container')).toEqual({ safe: true });
    });

    it('should allow docker inspect commands', () => {
      expect(validateCommand('docker inspect container-name')).toEqual({ safe: true });
    });

    it('should allow docker stats commands', () => {
      expect(validateCommand('docker stats --no-stream')).toEqual({ safe: true });
    });

    it('should allow docker network commands', () => {
      expect(validateCommand('docker network ls')).toEqual({ safe: true });
      expect(validateCommand('docker network inspect optima-prod')).toEqual({ safe: true });
    });

    it('should allow system monitoring commands', () => {
      expect(validateCommand('df -h')).toEqual({ safe: true });
      expect(validateCommand('free -h')).toEqual({ safe: true });
      expect(validateCommand('uptime')).toEqual({ safe: true });
      expect(validateCommand('date')).toEqual({ safe: true });
    });

    it('should allow systemctl status', () => {
      expect(validateCommand('systemctl status docker')).toEqual({ safe: true });
      expect(validateCommand('systemctl status actions.runner')).toEqual({ safe: true });
    });

    it('should allow journalctl', () => {
      expect(validateCommand('journalctl -u docker.service')).toEqual({ safe: true });
      expect(validateCommand('journalctl -n 50')).toEqual({ safe: true });
    });

    it('should allow file reading commands', () => {
      expect(validateCommand('cat /etc/os-release')).toEqual({ safe: true });
      expect(validateCommand('grep ERROR /var/log/app.log')).toEqual({ safe: true });
      expect(validateCommand('tail -n 100 /var/log/app.log')).toEqual({ safe: true });
      expect(validateCommand('head -n 50 /var/log/app.log')).toEqual({ safe: true });
    });

    it('should allow directory listing', () => {
      expect(validateCommand('ls -la /opt')).toEqual({ safe: true });
      expect(validateCommand('find /var/log -name "*.log"')).toEqual({ safe: true });
    });

    it('should allow basic shell commands', () => {
      expect(validateCommand('pwd')).toEqual({ safe: true });
      expect(validateCommand('whoami')).toEqual({ safe: true });
      expect(validateCommand('echo "test"')).toEqual({ safe: true });
    });
  });

  describe('低风险命令（应该通过）', () => {
    it('should allow docker restart commands', () => {
      expect(validateCommand('docker restart container-name')).toEqual({ safe: true });
      expect(validateCommand('docker-compose restart')).toEqual({ safe: true });
      expect(validateCommand('docker-compose restart service-name')).toEqual({ safe: true });
    });

    it('should allow systemctl restart', () => {
      expect(validateCommand('systemctl restart docker')).toEqual({ safe: true });
      expect(validateCommand('systemctl restart nginx')).toEqual({ safe: true });
    });
  });

  describe('危险命令（应该被阻止）', () => {
    it('should block rm commands', () => {
      const result = validateCommand('rm -rf /tmp/file');
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('rm ');
    });

    it('should block docker rm commands', () => {
      const result = validateCommand('docker rm container-name');
      expect(result.safe).toBe(false);
      // 错误消息包含危险操作 "rm"
      expect(result.reason).toContain('rm');
    });

    it('should block docker system prune', () => {
      const result = validateCommand('docker system prune -a');
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('docker system prune');
    });

    it('should block docker volume rm', () => {
      const result = validateCommand('docker volume rm volume-name');
      expect(result.safe).toBe(false);
      // 错误消息包含危险操作 "rm"
      expect(result.reason).toContain('rm');
    });

    it('should block kill commands', () => {
      const result = validateCommand('kill -9 1234');
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('kill ');
    });

    it('should block system control commands', () => {
      expect(validateCommand('shutdown now').safe).toBe(false);
      expect(validateCommand('reboot').safe).toBe(false);
      expect(validateCommand('poweroff').safe).toBe(false);
    });

    it('should block output redirection', () => {
      expect(validateCommand('echo "test" > /etc/file').safe).toBe(false);
      expect(validateCommand('cat file >> /var/log/app.log').safe).toBe(false);
    });

    it('should block pipe operations', () => {
      const result = validateCommand('docker ps | grep container');
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('|');
    });

    it('should block command chaining', () => {
      expect(validateCommand('docker ps; rm -rf /tmp').safe).toBe(false);
      expect(validateCommand('docker ps && docker rm test').safe).toBe(false);
      expect(validateCommand('docker ps || echo failed').safe).toBe(false);
    });
  });

  describe('未知命令（应该被阻止）', () => {
    it('should block unknown commands', () => {
      const result = validateCommand('unknown-command --flag');
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('未在白名单中');
    });

    it('should block curl without whitelist', () => {
      const result = validateCommand('curl https://example.com');
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('未在白名单中');
    });

    it('should block wget', () => {
      const result = validateCommand('wget https://example.com/file');
      expect(result.safe).toBe(false);
    });
  });

  describe('大小写不敏感', () => {
    it('should handle uppercase commands', () => {
      expect(validateCommand('DOCKER PS').safe).toBe(true);
      expect(validateCommand('Docker Logs container').safe).toBe(true);
    });

    it('should block dangerous commands regardless of case', () => {
      expect(validateCommand('RM -rf /tmp').safe).toBe(false);
      expect(validateCommand('Docker RM container').safe).toBe(false);
    });
  });

  describe('命令前后空格', () => {
    it('should trim whitespace', () => {
      expect(validateCommand('  docker ps  ')).toEqual({ safe: true });
      expect(validateCommand('\n\tdocker logs\n')).toEqual({ safe: true });
    });
  });
});
