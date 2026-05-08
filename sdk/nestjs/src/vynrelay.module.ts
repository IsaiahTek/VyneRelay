import { Module, DynamicModule, Global, OnApplicationBootstrap, OnModuleInit, Type, Inject } from '@nestjs/common';
import { MetadataScanner, DiscoveryModule, HttpAdapterHost, ModulesContainer } from '@nestjs/core';
import { VynServer, type VynServerOptions } from '@vynelix/vynrelay-server';
import { VYN_RELAY_SERVER, VYN_RELAY_OPTIONS, VYN_RELAY_SUBSCRIBE_METADATA } from './constants.js';

@Global()
@Module({
  imports: [DiscoveryModule],
})
export class VynRelayModule implements OnApplicationBootstrap, OnModuleInit {
  constructor(
    @Inject(VYN_RELAY_SERVER) private readonly server: VynServer,
    @Inject(VYN_RELAY_OPTIONS) private readonly options: VynServerOptions,
    private readonly modulesContainer: ModulesContainer,
    private readonly metadataScanner: MetadataScanner,
    private readonly adapterHost: HttpAdapterHost,
  ) {
    console.log('[VynRelay] Module initialized');
  }

  /**
   * Register the VynRelay server globally in the NestJS application.
   */
  static forRoot(options: VynServerOptions): DynamicModule {
    const serverProvider = {
      provide: VYN_RELAY_SERVER,
      useValue: new VynServer(options),
    };

    const optionsProvider = {
      provide: VYN_RELAY_OPTIONS,
      useValue: options,
    };

    return {
      module: VynRelayModule,
      imports: [DiscoveryModule],
      providers: [VynRelayModule, serverProvider, optionsProvider],
      exports: [serverProvider],
    };
  }

  /**
   * Register the VynRelay server asynchronously.
   */
  static forRootAsync(options: {
    imports?: any[];
    useFactory: (...args: any[]) => Promise<VynServerOptions> | VynServerOptions;
    inject?: any[];
  }): DynamicModule {
    const optionsProvider = {
      provide: VYN_RELAY_OPTIONS,
      useFactory: options.useFactory,
      inject: options.inject || [],
    };

    const serverProvider = {
      provide: VYN_RELAY_SERVER,
      useFactory: (opts: VynServerOptions) => new VynServer(opts),
      inject: [VYN_RELAY_OPTIONS],
    };

    return {
      module: VynRelayModule,
      imports: [...(options.imports || []), DiscoveryModule],
      providers: [VynRelayModule, optionsProvider, serverProvider],
      exports: [serverProvider],
    };
  }


  private initialized = false;

  onModuleInit() {
    this.initialize();
  }

  onApplicationBootstrap() {
    this.initialize();
  }

  private initialize() {
    if (this.initialized) return;
    this.initialized = true;

    // If no port is provided, we attach to the existing NestJS HTTP server
    if (!this.options.port && !this.options.server) {
      console.log('[VynRelay] No port provided. Searching for host HTTP server...');
      let attempts = 0;
      const tryAttach = () => {
        const httpServer = this.adapterHost.httpAdapter?.getHttpServer();
        if (httpServer) {
          this.server.attach(httpServer);
          console.log('\x1b[32m%s\x1b[0m', '[VynRelay] >>> SUCCESSFULLY ATTACHED TO SHARED HTTP SERVER <<<');
        } else if (attempts < 30) { // Try for 15 seconds total
          attempts++;
          setTimeout(tryAttach, 500);
        } else {
          console.error('\x1b[31m%s\x1b[0m', '[VynRelay] >>> ERROR: NESTJS HTTP SERVER NOT FOUND AFTER 15s <<<');
        }
      };
      tryAttach();
    }

    // Scan all modules for providers/controllers with SubscribeTopic decorators
    const modules = [...this.modulesContainer.values()];
    
    for (const module of modules) {
      for (const instanceWrapper of module.providers.values()) {
        this.lookupSubscriptions(instanceWrapper.instance, this.server);
      }
      for (const instanceWrapper of module.controllers.values()) {
        this.lookupSubscriptions(instanceWrapper.instance, this.server);
      }
    }
  }

  private lookupSubscriptions(instance: any, server: VynServer) {
    if (!instance) return;

    const prototype = Object.getPrototypeOf(instance);
    this.metadataScanner.scanFromPrototype(
      instance,
      prototype,
      (methodName) => {
        const topic = Reflect.getMetadata(VYN_RELAY_SUBSCRIBE_METADATA, instance[methodName]);
        if (topic) {
          // Found a subscription!
          // We wrap it in a client-like subscribe call
          // Note: In Phase 2, VynServer.subscribe is internal to clients, 
          // but we want the server to be able to "intercept" topics too.

          // For now, let's assume the server has a way to register internal listeners
          // I will need to expose a method on VynServer for this.
          (server as any).internalSubscribe(topic, (payload: any) => {
            instance[methodName](payload);
          });

          console.log(`[VynRelay] Bound ${instance.constructor.name}.${methodName} to topic: ${topic}`);
        }
      },
    );
  }
}
