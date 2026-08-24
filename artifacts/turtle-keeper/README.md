# Turtle Keeper

An offline-first personal Android app for keeping a daily care routine for turtles.

## What is included

- Multiple turtle profiles with species, weight, shell length, notes, and photo
- Daily care checklist with completion times
- Food, water, and sun/UV activity logs
- Local reminders with an enable/disable switch
- Calendar view of care activity
- Weekly care completion and weight-history views
- Local JSON backup action
- Light/dark/system appearance through the device theme
- No account, login, ads, analytics, cloud sync, or required server

## Technology

- React Native with Expo SDK 54 and Expo Router
- TypeScript
- AsyncStorage for on-device persistence
- Expo Image Picker for turtle photos
- Expo Haptics for touch feedback
- Expo Notifications for local Android reminder scheduling

## Run locally

```bash
pnpm install
pnpm --filter @workspace/turtle-keeper run dev
```

The project is a standard Expo project and can be moved to another machine. Open the Expo URL or scan the QR code with Expo Go.

## Android APK

This workspace does not claim to contain an APK unless a real Android build has completed. To create an installable APK outside this workspace, use a normal Expo Android build pipeline (for example, a local Android toolchain or an Expo-compatible build service) and follow its current Expo SDK 54 instructions. Google Play publishing is not part of this project.

## Notifications

Daily reminders are scheduled as local Android notifications after notification permission is granted. Expo Go and the web preview have platform limitations; verify notification delivery in an Android development/production build. Android notification channels, permission prompts, and scheduled reminders are configured by Expo's standard notification module. Notification action buttons such as Done/Snooze are not included in this first build.

## Data and privacy

Data is stored on the device under the Turtle Keeper AsyncStorage key. Nothing in the app requires an account or sends turtle records to a server. The export action keeps a JSON snapshot locally; a file-picker based share/import flow can be added when a native file-sharing target is selected.