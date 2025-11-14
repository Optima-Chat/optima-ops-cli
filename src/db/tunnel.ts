import { Client as SSHClient } from 'ssh2';
import { createServer, Server as NetServer, Socket } from 'net';
import { Environment, getEC2Config, getSSHPrivateKey } from '../utils/config.js';
import { DatabaseError } from '../utils/error.js';

/**
 * SSH Tunnel Manager for PostgreSQL connections
 *
 * Creates an SSH tunnel to forward local port to RDS private IP
 */
export class SSHTunnel {
  private sshClient: SSHClient | null = null;
  private server: NetServer | null = null;
  private localPort: number = 0;
  private isReady: boolean = false;

  constructor(
    private readonly env: Environment,
    private readonly rdsPrivateHost: string = '10.0.10.221',
    private readonly rdsPort: number = 5432
  ) {}

  /**
   * Start the SSH tunnel
   * Returns the local port to connect to
   */
  async connect(): Promise<number> {
    if (this.isReady) {
      return this.localPort;
    }

    return new Promise((resolve, reject) => {
      try {
        const ec2Config = getEC2Config(this.env);
        const privateKey = getSSHPrivateKey(this.env);

        this.sshClient = new SSHClient();

        this.sshClient
          .on('ready', () => {
            // Create local server to forward connections
            this.server = createServer((clientSocket: Socket) => {
              this.sshClient!.forwardOut(
                '127.0.0.1',
                0,
                this.rdsPrivateHost,
                this.rdsPort,
                (err, stream) => {
                  if (err) {
                    clientSocket.end();
                    return;
                  }

                  // Pipe the connection through SSH tunnel
                  clientSocket.pipe(stream).pipe(clientSocket);

                  clientSocket.on('error', () => {
                    stream.end();
                  });

                  stream.on('error', () => {
                    clientSocket.end();
                  });
                }
              );
            });

            // Listen on random available port
            this.server!.listen(0, '127.0.0.1', () => {
              const address = this.server!.address();
              if (address && typeof address === 'object') {
                this.localPort = address.port;
                this.isReady = true;
                resolve(this.localPort);
              } else {
                reject(new Error('Failed to get server address'));
              }
            });

            this.server!.on('error', (err) => {
              reject(new DatabaseError('Local server error', { error: err.message }));
            });
          })
          .on('error', (err) => {
            reject(
              new DatabaseError(`SSH connection failed: ${err.message}`, {
                host: ec2Config.host,
                error: err.message,
              })
            );
          })
          .connect({
            host: ec2Config.host,
            port: 22,
            username: ec2Config.user,
            privateKey,
            readyTimeout: 30000,
          });
      } catch (error: any) {
        reject(new DatabaseError('Failed to establish SSH tunnel', { error: error.message }));
      }
    });
  }

  /**
   * Close the SSH tunnel
   */
  async disconnect(): Promise<void> {
    return new Promise((resolve) => {
      let closed = 0;
      const checkComplete = () => {
        closed++;
        if (closed >= 2) {
          this.isReady = false;
          this.localPort = 0;
          resolve();
        }
      };

      if (this.server) {
        this.server.close(() => {
          this.server = null;
          checkComplete();
        });
      } else {
        checkComplete();
      }

      if (this.sshClient) {
        this.sshClient.end();
        this.sshClient = null;
        checkComplete();
      } else {
        checkComplete();
      }
    });
  }

  /**
   * Get the local port to connect to
   */
  getLocalPort(): number {
    if (!this.isReady) {
      throw new DatabaseError('SSH tunnel not ready. Call connect() first.');
    }
    return this.localPort;
  }

  /**
   * Check if tunnel is ready
   */
  isConnected(): boolean {
    return this.isReady;
  }
}
