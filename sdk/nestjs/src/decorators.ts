import { SetMetadata } from '@nestjs/common';
import { VYN_RELAY_SUBSCRIBE_METADATA } from './constants.js';

/**
 * SubscribeTopic — A decorator to automatically register a method as a listener 
 * for a specific VynRelay topic.
 * 
 * @param topic The topic to subscribe to.
 */
export const SubscribeTopic = (topic: string): MethodDecorator => 
  SetMetadata(VYN_RELAY_SUBSCRIBE_METADATA, topic);
