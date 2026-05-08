import { Module } from '@nestjs/common';
import { VynRelayModule } from '@vynelix/vynrelay-nestjs';
// import { AuthModule } from '@vynelix/nestjs-multi-auth';

@Module({
  imports: [
    VynRelayModule.forRoot({
      upgradeHandler: async (req) => {
        const url = new URL(req.url || '', `http://${req.headers.host}`);
        const username = (req.headers['x-username'] || url.searchParams.get('x-username')) as string;
        if (!username || username === 'anonymous') return null;
        return { id: username, role: 'user' };
      },
      authHandler: async (token) => {
        // In the demo, we treat the token as the username/identity
        return { id: token, role: 'user' };
      },
      aclHandler: async (user, topic, action) => {
        const normalizedTopic = topic.toLowerCase();
        
        // If not authenticated, only allow reading public topics
        if (!user) {
          return normalizedTopic.startsWith('public.') && action === 'read';
        }

        console.log(`[ACL] User: ${user.id}, Topic: ${topic}, Action: ${action}`);

        // Admin can do anything
        if (user.role === 'admin') return true;

        // Public topics: Everyone can read/write
        if (normalizedTopic.startsWith('public.')) return true;

        // Private messaging: user.[userId]
        if (normalizedTopic.startsWith('user.')) {
          const targetUserId = normalizedTopic.split('.')[1];
          
          // Only the owner can SUBSCRIBE (read) their own messages
          if (action === 'read') {
            const isOwner = user.id.toLowerCase() === targetUserId;
            console.log(`[ACL] Private Read Check: ${user.id} == ${targetUserId} -> ${isOwner}`);
            return isOwner;
          }
          
          // Any authenticated user can PUBLISH (write) to another user's inbox
          if (action === 'write') {
            return true;
          }
        }

        return false;
      },
      // port: 3002
    }),
  ],
})
export class RealtimeModule { }
