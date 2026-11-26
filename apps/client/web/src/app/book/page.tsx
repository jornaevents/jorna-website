"use client";

// /book?service=<id> was the old "Request booking" page: it created a booking
// (POST /bookings) with no inquiry behind it, which every contract now needs
// (backend DECISIONS #54). Nothing links here any more, but old emails and
// bookmarks still do, so it sends them to the package's own page, where Send
// an inquiry opens with that package picked. A redirect in _redirects can't
// do this: it would have to rename the query parameter (service → id).

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormSkeleton } from "@/components/Skeletons";

function BookRedirect() {
  const router = useRouter();
  const serviceId = useSearchParams().get("service");

  useEffect(() => {
    router.replace(serviceId ? `/service?id=${encodeURIComponent(serviceId)}` : "/marketplace");
  }, [router, serviceId]);

  return <FormSkeleton label="Opening the package…" />;
}

// useSearchParams needs a Suspense boundary to prerender in the static export.
export default function BookPage() {
  return (
    <Suspense fallback={<FormSkeleton label="Opening the package…" />}>
      <BookRedirect />
    </Suspense>
  );
}
