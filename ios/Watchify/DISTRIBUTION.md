# Run Watchify on iPhone and share through TestFlight

The project is an iOS app source project, not an unsigned package that can be installed by opening a link. An iPhone installation needs Apple signing. A TestFlight invitation becomes available only after the app owner uploads and enables an eligible build in App Store Connect.

## 1. Run the app on your iPhone

1. Open `ios/Watchify/Watchify.xcodeproj` in Xcode 26 or later and select the **Watchify** scheme.
2. In **Xcode → Settings → Accounts**, use your Apple account. Keep passwords, signing keys and provisioning files out of the repository.
3. Under the **Watchify** target's **Signing & Capabilities**, leave **Automatically manage signing** enabled and select your team. `DEVELOPMENT_TEAM` is intentionally blank in the checked-in project.
4. Use the app's bundle identifier, `com.jheype.watchify`, if it is available to your team. If you change it, use the same identifier for the App Store Connect app record later. The test bundle has its own `.tests` suffix.
5. Connect or pair your iPhone, select it as the destination, complete any device trust/Developer Mode step, then choose **Product → Run**.

Simulator runs do not require a distribution certificate or App Store Connect app record. Physical-device development signing and TestFlight distribution are separate steps; a simulator ZIP cannot replace either.

## 2. Create the matching App Store Connect record

Use the Apple Developer team that owns this product. TestFlight distribution requires Apple Developer Program membership and an App Store Connect role with the needed app/build permissions.

In **App Store Connect → Apps**, create or select the **Watchify** iOS app. Match the registered bundle identifier from Xcode. Choose the actual primary language and internal SKU, and grant access only to the intended team. Do not create an unrelated duplicate record if Watchify is already registered.

No Apple team ID, account, app record or certificate has been assumed by this project. The owner must resolve any membership, agreement or signing prompt in their own Apple account.

## 3. Archive and upload

1. Check **Version** and **Build** on the Watchify target. The initial native values are `1.0` and `1`; increment the build number before uploading another build of the same version.
2. Select a generic iOS device destination, such as **Any iOS Device (arm64)**, and choose **Product → Archive**. A simulator destination does not create the distribution archive.
3. In **Window → Organizer → Archives**, select the new Watchify archive. Run validation, then choose **Distribute App → App Store Connect** and the upload option appropriate for your team.
4. Allow Xcode to use the owner's valid distribution signing assets. Upload only after reviewing the archive details. Wait for Apple's processing to finish; an upload attempt is not an available TestFlight build.
5. In the app's **TestFlight** tab, select the processed build. Complete export-compliance and beta information if requested.

Apple's published requirement, effective 28 April 2026, is **Xcode 26 or newer with the iOS 26 SDK or newer** for uploaded iOS builds. The app can still support iOS 17 devices through its deployment target. See [SDK minimum requirements](https://developer.apple.com/news/upcoming-requirements/?id=04282026a) and [Upload builds](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds).

## 4. Share with the Zeit testers

**Internal testers** are eligible App Store Connect users with app access. Add the processed build to an internal group and enable the intended testers.

**External testers** use an external TestFlight group. Apple requires an internal group to exist before you create an external group. Add the build, provide the test description and review information, and submit the first eligible build for TestFlight App Review. A build uploaded as **TestFlight Internal Only** cannot be assigned to external groups. After approval, use that group's email invitations or public link. Do not promise the link or send invitations before the group and build are ready.

Apple currently documents up to **100 internal testers** and **10,000 external testers**. An external group/public link does not grant a tester App Store Connect access. See [TestFlight](https://developer.apple.com/testflight/) and [Invite external testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/).

## 5. Review information for this build

Describe the actual product: a private watch-collection and Analytics app with shared web/iPhone data, manual watch entry, optional photographs, value alerts, indices and local valuation PDF sharing. Market figures are illustrative; no live pricing provider, purchase checkout or scheduled marketing email is connected.

The app contains a SwiftUI/WebKit presentation of the hosted Watchify service. It is not a separate implementation of every screen in SwiftUI. Demonstrate the useful collection and Analytics flows, native export sharing and connection recovery. Apple's minimum-functionality review is a judgement by App Review, so this architecture does not guarantee acceptance. See [App Review Guidelines, section 4.2](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality).

Before an external/public submission, supply the actual privacy-policy and support URLs, accurate privacy answers, age rating, contact information and test instructions. If review requires sign-in, the owner needs to provide a dedicated review account through Apple's secure review fields. This repository contains no review credentials.

The hosted site currently exposes account creation. Check that the release also satisfies Apple's in-app account-deletion requirement before a public App Store submission; do not describe a password reset or sign-out button as account deletion. The wrapper does not add a privileged account-deletion endpoint. See [App Review Guidelines, section 5.1.1](https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage).

The supplied privacy manifest is a starting declaration based on the current code and hosted fields; it does not publish App Store Connect privacy answers. Verify the deployed service's collection, retention and third-party infrastructure practices with the owner. The export-compliance flag represents the current platform TLS use and must be reassessed if the app's cryptography changes.

## Acceptance check on two devices

Use a disposable test collection under the same Watchify account in both the website and the signed iPhone app.

1. Add a watch on the website and wait for the saved status. Bring the app to the foreground and verify the same piece, specification and value.
2. Edit the purchase details or preferences in the app, wait for saving, then verify the change on the website.
3. Keep an unsaved form open on one device while changing another item on the other. Verify that the first form is not discarded silently and that any revision conflict offers the documented recovery path.
4. Select a photograph through the system chooser; cancel once, then choose a valid image. Verify the web and app detail screens agree after saving.
5. Download a valuation PDF in the app. Confirm that the iOS share sheet opens, the PDF has the correct collection total, and cancelling the sheet leaves the app usable.
6. Disconnect briefly, restore the connection and return to the foreground. Verify an honest connection state and recovery without a duplicate collection entry.
7. Sign out, then open another test account. Confirm the previous account's collection and pending export are not available to it.

Record the device/iOS version and build number with the results. Automated native policy tests and an unsigned CI build do not establish these signed-device, real-account results.
