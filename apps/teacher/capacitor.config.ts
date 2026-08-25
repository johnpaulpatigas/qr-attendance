import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.johnpaulpatigas.qrattendance.teacher",
  appName: "DepEd Teacher Attendance",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
