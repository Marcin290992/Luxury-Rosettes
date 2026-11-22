import { defineCliConfig } from 'sanity/cli';

export default defineCliConfig({
  api: { projectId: 'rmtqqab1', dataset: 'production' },
  // the hosted Studio (luxury-rosettes-studio.sanity.studio): `npm run deploy` updates it without asking again
  deployment: { appId: 'u36bfopgzlbiip9vmo27ul92' },
});
