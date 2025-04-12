import { CoreModule } from "dynamsoft-core";
import { LicenseManager } from "dynamsoft-license";
import "dynamsoft-barcode-reader"; // Import the BarcodeReader module to ensure it's included

// Configure the paths where the .wasm files are located.
// Using CDN path as in the sample. For production, consider hosting these locally.
CoreModule.engineResourcePaths.rootDirectory = "https://cdn.jsdelivr.net/npm/";
// Optional: Specify paths for individual modules if needed
// CoreModule.engineResourcePaths.dbr = "/dbr-resources"; // Example if hosting locally

/** LICENSE ALERT - README
 * You need a valid license key to use the Dynamsoft Barcode Reader SDK.
 * Get a trial license here: https://www.dynamsoft.com/customer/license/trialLicense?product=dbr
 * Replace the placeholder below with your actual license key.
 */
const DYNAMSOFT_LICENSE_KEY = process.env.NEXT_PUBLIC_DYNAMSOFT_LICENSE_KEY;

if (!DYNAMSOFT_LICENSE_KEY) {
  console.error("ERROR: NEXT_PUBLIC_DYNAMSOFT_LICENSE_KEY environment variable not set!");
  // Optionally throw an error or prevent initialization
} else {
  LicenseManager.initLicense(DYNAMSOFT_LICENSE_KEY, {
    // Set executeNow to true to initialize the license immediately.
    // Set it to false if you want to initialize it later manually using initLicense().
    executeNow: true,
  });
}

console.log("Attempting to initialize Dynamsoft License...");

// Optional: Preload the BarcodeReader module to potentially speed up the first scan.
CoreModule.loadWasm(["DBR"]).then(() => {
    console.log("Dynamsoft Barcode Reader WASM module preloaded.");
}).catch(err => {
    console.error("Failed to preload Dynamsoft Barcode Reader WASM module:", err);
});

// Export something to make it a module
// Export a dummy value to ensure this file is treated as a module
export const dynamsoftConfigLoaded = true;