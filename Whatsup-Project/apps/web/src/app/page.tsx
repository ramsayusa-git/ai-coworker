import { MarketingShell } from "@/components/marketing/marketing-shell";
import { ProductHomeContent } from "@/components/marketing/product-home-content";

// Site default page: "/" always renders the product/marketing homepage,
// for every visitor, signed in or not. Signed-in users are not auto-
// redirected here — they land on the website like anyone else and use
// "Sign in" / the sidebar to go into the app. The app's own default page
// is "/dashboard", reached after sign-in (see login/register redirects)
// or by navigating there directly.
export default function RootPage() {
  return (
    <MarketingShell>
      <ProductHomeContent />
    </MarketingShell>
  );
}
