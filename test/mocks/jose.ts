// Jest moduleNameMapper points at this file so any spec that
// transitively imports `jose` (e.g. via auth.module → oauth-verifier)
// doesn't try to load the real ESM build. Specs that exercise jose
// directly mock it explicitly via `jest.mock('jose', ...)`.

export const createRemoteJWKSet = (): unknown => (): Promise<unknown> =>
  Promise.resolve('mock-key');

export const jwtVerify = async (): Promise<{ payload: Record<string, unknown> }> => {
  throw new Error('jose.jwtVerify mock — override with jest.mock in your spec');
};
