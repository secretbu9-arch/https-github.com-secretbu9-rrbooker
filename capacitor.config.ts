import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rnrbooker.app',
  appName: 'R&RBooker',
  webDir: 'build',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    },
    LocalNotifications: {
      smallIcon: "ic_stat_rrbooker",
      iconColor: "#F8A34A",
      sound: "beep.wav"
    },
    FirebaseMessaging: {
      presentationOptions: ["badge", "sound", "alert"]
    }
  }
};

export default config;