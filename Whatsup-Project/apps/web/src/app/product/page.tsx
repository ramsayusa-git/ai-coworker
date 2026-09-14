import { redirect } from "next/navigation";

// The product homepage now lives at "/" (the site default). Keep this route
// alive as a redirect so old links (nav, bookmarks) still work.
export default function ProductRedirect() {
  redirect("/");
}
