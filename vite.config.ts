import {defineConfig} from 'vite';

export default defineConfig({
  // Relative paths allow one build to run at a domain root or a Pages repository path.
  base:'./',
  cacheDir:'node_modules/.vite',
  server:{host:'127.0.0.1'},
  build:{target:'es2022',rolldownOptions:{output:{codeSplitting:{groups:[
    {name:'physics',test:/@dimforge/},
    {name:'rendering',test:/node_modules[\\/]three/},
  ]}}}},
});
