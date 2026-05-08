export declare class TopicManager {
    private subscriptions;
    subscribe(clientId: string, topic: string): void;
    unsubscribe(clientId: string, topic: string): void;
    unsubscribeAll(clientId: string): void;
    getSubscribers(topic: string): Set<string>;
    /**
     * Matches hierarchical topics.
     * e.g. "a.b.*" matches "a.b.c"
     * e.g. "a.#" matches "a.b.c", "a.d", etc.
     */
    getMatchingSubscribers(topic: string): Set<string>;
    private match;
}
//# sourceMappingURL=topic-manager.d.ts.map