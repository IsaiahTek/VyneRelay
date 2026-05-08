export class TopicManager {
  // topic -> Set of client IDs
  private subscriptions: Map<string, Set<string>> = new Map();

  subscribe(clientId: string, topic: string) {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set());
    }
    this.subscriptions.get(topic)!.add(clientId);
  }

  unsubscribe(clientId: string, topic: string) {
    if (this.subscriptions.has(topic)) {
      this.subscriptions.get(topic)!.delete(clientId);
      if (this.subscriptions.get(topic)!.size === 0) {
        this.subscriptions.delete(topic);
      }
    }
  }

  unsubscribeAll(clientId: string) {
    for (const [topic, clients] of this.subscriptions.entries()) {
      if (clients.has(clientId)) {
        clients.delete(clientId);
        if (clients.size === 0) {
          this.subscriptions.delete(topic);
        }
      }
    }
  }

  getSubscribers(topic: string): Set<string> {
    const subscribers = new Set<string>();

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
  getMatchingSubscribers(topic: string): Set<string> {
    const subscribers = new Set<string>();
    
    for (const [subTopic, clients] of this.subscriptions.entries()) {
      if (this.match(subTopic, topic)) {
        clients.forEach(id => subscribers.add(id));
      }
    }

    return subscribers;
  }

  private match(pattern: string, topic: string): boolean {
    if (pattern === topic) return true;
    if (pattern === '#') return true;

    const patternParts = pattern.split('.');
    const topicParts = topic.split('.');

    for (let i = 0; i < patternParts.length; i++) {
      const p = patternParts[i];
      if (p === '#') return true; // Matches everything after
      if (p === '*') {
        if (i >= topicParts.length) return false;
        continue;
      }
      if (p !== topicParts[i]) return false;
    }

    return patternParts.length === topicParts.length;
  }
}
