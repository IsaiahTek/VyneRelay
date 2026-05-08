export class TopicManager {
    // topic -> Set of client IDs
    subscriptions = new Map();
    subscribe(clientId, topic) {
        if (!this.subscriptions.has(topic)) {
            this.subscriptions.set(topic, new Set());
        }
        this.subscriptions.get(topic).add(clientId);
    }
    unsubscribe(clientId, topic) {
        if (this.subscriptions.has(topic)) {
            this.subscriptions.get(topic).delete(clientId);
            if (this.subscriptions.get(topic).size === 0) {
                this.subscriptions.delete(topic);
            }
        }
    }
    unsubscribeAll(clientId) {
        for (const [topic, clients] of this.subscriptions.entries()) {
            if (clients.has(clientId)) {
                clients.delete(clientId);
                if (clients.size === 0) {
                    this.subscriptions.delete(topic);
                }
            }
        }
    }
    getSubscribers(topic) {
        const subscribers = new Set();
        // For now, only exact matching. 
        // TODO: Implement hierarchical matching (e.g. tracker.#)
        const exact = this.subscriptions.get(topic);
        if (exact) {
            exact.forEach(id => subscribers.add(id));
        }
        return subscribers;
    }
    /**
     * Matches hierarchical topics.
     * e.g. "a.b.*" matches "a.b.c"
     * e.g. "a.#" matches "a.b.c", "a.d", etc.
     */
    getMatchingSubscribers(topic) {
        const subscribers = new Set();
        for (const [subTopic, clients] of this.subscriptions.entries()) {
            if (this.match(subTopic, topic)) {
                clients.forEach(id => subscribers.add(id));
            }
        }
        return subscribers;
    }
    match(pattern, topic) {
        if (pattern === topic)
            return true;
        if (pattern === '#')
            return true;
        const patternParts = pattern.split('.');
        const topicParts = topic.split('.');
        for (let i = 0; i < patternParts.length; i++) {
            const p = patternParts[i];
            if (p === '#')
                return true; // Matches everything after
            if (p === '*') {
                if (i >= topicParts.length)
                    return false;
                continue;
            }
            if (p !== topicParts[i])
                return false;
        }
        return patternParts.length === topicParts.length;
    }
}
//# sourceMappingURL=topic-manager.js.map