// Hyperion's computer app (M412): tells the page it is running inside the app (so it hides "Install Hyperion"), and
// nothing else: the page gets no access to the computer through this.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('hyperionDesktop', Object.freeze({ app: true, platform: process.platform }));
