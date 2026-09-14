import { CompanyDetailView } from "@/components/companies/company-detail-view";

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CompanyDetailView companyId={id} />;
}
