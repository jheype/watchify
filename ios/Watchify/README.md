# Watchify for iPhone

The iPhone app is written in Swift with SwiftUI and WebKit. It presents the same Watchify interface served at <https://watchify-azure.vercel.app/>. Native code provides the app lifecycle, navigation controls, connection handling and export sharing; the hosted interface provides the existing collection, market, Analytics, add-watch, alerts and account flows.

The app uses the same Supabase account and private workspace as the website. Sign in with the same account on both devices. The app does not create a second catalogue, copy user data into an independent native database or store a service-role key. An Internet connection is needed for authentication and cloud synchronisation. An offline screen is a recovery state, not a promise of offline editing or background synchronisation.

## Open and run

1. Use a Mac with **Xcode 26 or newer** installed. Open `ios/Watchify/Watchify.xcodeproj` directly. No XcodeGen, CocoaPods or Swift package download is required.
2. Select the shared **Watchify** scheme and an iPhone simulator, then choose **Product → Run**. The deployment target is iOS 17; building with a current iOS SDK does not require users to have iOS 26 installed.
3. For a physical iPhone, select the **Watchify** app target, open **Signing & Capabilities**, and select your own Apple Developer team. Automatic signing is configured, but no team or signing identity is committed. Confirm that `com.jheype.watchify` is available to your team, or change the app and test bundle identifiers consistently before registering the app.
4. Select your paired iPhone as the run destination and enable Developer Mode on the device if Xcode asks for it. Build and run from Xcode.

The native app starts at version **1.0**, build **1**. Web release numbers are independent: the app displays the deployed Watchify version, and compatible website updates become available to both surfaces. Changes to Swift code require a new iOS build.

## What is shared

| Area | Source of truth |
| --- | --- |
| Sign-in and account access | The existing Watchify Supabase Auth project |
| Collection, optional purchase data, follows, alerts and preferences | The authenticated user's existing private cloud workspace |
| Design, navigation and Analytics calculations | The same deployed Watchify interface |
| Market catalogue and estimates | The same illustrative dataset used by the website |
| Photographs | The web upload pipeline, using the iPhone's system file/photo chooser |
| Valuation PDF and collection exports | The existing web generator, handed to the native share sheet |

Changes appear on another signed-in surface after the first device has saved and the receiving surface has refreshed its cloud workspace. Visible sessions check every **15 seconds**, and again when returning to the foreground, regaining focus or reconnecting. An active form, upload, export or unsaved edit defers incoming changes. Conflicting revisions retain the local copy for explicit recovery. No background task has been added that can promise updates while iOS suspends the app.

## Native project layout

- `Watchify/`: Swift source, app assets, `Info.plist` and `PrivacyInfo.xcprivacy`.
- `WatchifyTests/`: policy and boundary tests for the native navigation/export code.
- `Watchify.xcodeproj/`: checked-in Xcode project with a shared **Watchify** scheme.
- `DISTRIBUTION.md`: signed device build and TestFlight steps.

The Xcode project uses synchronised source folders: new Swift files in the app/test directories automatically join their matching target. `Info.plist` is excluded from copied resources and is processed as the app's property list. All frameworks are supplied by the iOS SDK.

## Native boundaries

Top-level web content is restricted to the canonical Watchify origin. App-bound domains and navigation checks work together; Supabase is reached by the website as an API subresource. App Transport Security remains at its HTTPS defaults, with no arbitrary-load exceptions. External destinations do not inherit the trusted app bridge.

The native download handler accepts only the explicit export protocol from the main Watchify frame. It validates names, supported content types, message sizes and file content before presenting a system share sheet. PDF and CSV exports are limited to 8 MiB; the Watchify recovery JSON envelope is limited to 32 MiB. It receives an export only when the user requests one; credentials and session tokens are not passed to Swift. Native export files use protected temporary storage and are removed when sharing finishes or is cancelled, with leftovers cleared on the next launch.

Password recovery opens the fixed Watchify recovery page in the iPhone's browser, where the user can request and follow the email link in the same browser context. The native recovery message carries neither an email address nor a token or arbitrary URL. After resetting the password, return to the app and sign in normally. WebKit's persistent app session and Safari's browser session are separate.

The system's normal file chooser supports photograph selection. Camera/photo purpose strings are present so an intentional camera or library action has an explanation. The app does not request unrelated location, microphone, tracking or notification permissions.

## Build verification

The workflow in `.github/workflows/watchify-ios.yml` is prepared to run on the official GitHub `macos-15` image with **Xcode 26.3** explicitly selected. It validates property lists, builds and runs the native tests on an available iOS 26 iPhone simulator, compiles a Release app against the device SDK without signing, and retains the test result bundle and simulator app. Official actions are pinned to immutable commits; the job has read-only repository permissions and no signing secrets.

The **Watchify-Simulator.zip** CI artifact is a simulator build. It is not an IPA and cannot be installed on a physical iPhone or shared through TestFlight. A workflow file being present does not establish a successful build: inspect the exact commit's Actions result before claiming compilation or device testing.

This repository may be edited from Linux, but an Apple SDK/Xcode build must run on macOS. Linux syntax or metadata checks are not a substitute for a successful Xcode build.

## Privacy and distribution

`PrivacyInfo.xcprivacy` describes the current hosted account/workspace fields used for app functionality: account name, email, user ID, optional photos, recorded purchases, collection asset information and user notes. These fields are linked to the account; tracking is not declared. The native shell has no advertising or analytics SDK and does not directly call required-reason APIs. Revisit the manifest if the Swift code, hosted data collection or SDKs change. App Store Connect privacy answers and a real privacy-policy URL still need to reflect the complete deployed service, including its infrastructure.

`ITSAppUsesNonExemptEncryption` is `NO` for the present app's platform-provided HTTPS/TLS use. Reassess this setting if custom encryption or additional libraries are introduced.

TestFlight requires a signed build and access to the owner's Apple Developer/App Store Connect account. Those credentials and a distribution profile are not part of this repository. See [DISTRIBUTION.md](DISTRIBUTION.md) for the concrete handoff. The source project is not evidence of an Apple-approved build or an available TestFlight invitation.

### Primary references

- [Apple: WKWebView](https://developer.apple.com/documentation/webkit/wkwebview)
- [WebKit: app-bound domains and hybrid apps](https://webkit.org/blog/10882/app-bound-domains/)
- [Apple: file upload panel behaviour on iOS](https://developer.apple.com/documentation/webkit/wkuidelegate/webview(_:runopenpanelwith:initiatedbyframe:completionhandler:))
- [Apple: current App Store Connect SDK requirements](https://developer.apple.com/news/upcoming-requirements/?id=04282026a)
- [Official GitHub macOS 15 runner software](https://github.com/actions/runner-images/blob/main/images/macos/macos-15-Readme.md)
- [Apple: privacy manifest data categories](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatype)
- [Apple: export-compliance property list key](https://developer.apple.com/documentation/bundleresources/information-property-list/itsappusesnonexemptencryption)
