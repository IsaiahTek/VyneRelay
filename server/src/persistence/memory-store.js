export class MemoryStore {
    // topic -> Array of message records
    messages = new Map();
    maxPerTopic = 1000;
    async push(topic, message) {
        if (!this.messages.has(topic)) {
            this.messages.set(topic, []);
        }
        const topicMessages = this.messages.get(topic);
        topicMessages.push(message);
        if (topicMessages.length > this.maxPerTopic) {
            topicMessages.shift();
        }
    }
    async getSince(topic, sinceId, sinceTimestamp) {
        const topicMessages = this.messages.get(topic) || [];
        if (sinceId) {
            const index = topicMessages.findIndex(m => m.id === sinceId);
            if (index !== -1) {
                return topicMessages.slice(index + 1);
            }
        }
        if (sinceTimestamp) {
            return topicMessages.filter(m => m.timestamp > sinceTimestamp);
        }
        return topicMessages;
    }
}
//# sourceMappingURL=memory-store.js.map