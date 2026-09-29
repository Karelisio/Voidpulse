/** Plugins semantic-release (sans déclarations de types) : ce que les tests en utilisent. */
declare module '@semantic-release/commit-analyzer' {
  export function analyzeCommits(options: object, context: object): Promise<string | null>;
}
declare module '@semantic-release/release-notes-generator' {
  export function generateNotes(options: object, context: object): Promise<string>;
}
