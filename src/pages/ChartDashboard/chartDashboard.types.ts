export interface GridItem {
    id: string;
    component: any;
    props: any;
}

export interface DashboardProps {
    zipData?: string | ArrayBuffer | Blob; // Supports Base64 (string), ArrayBuffer, or Blob
    config?: {
        template?: string; // e.g. "2x2" or "HORIZONTAL_1x1"
        showBottomRow?: boolean;
        viewMode?: "chart" | "table";
        selectedInternalFileName?: string; // New: Default file to select
    };
}
