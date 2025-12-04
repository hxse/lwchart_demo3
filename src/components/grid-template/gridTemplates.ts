// Grid模板配置字典
export interface GridTemplateConfig {
    gridTemplateAreas: string;
    gridTemplateColumns: string;
    gridTemplateRows: string;
}

// Grid模板类型枚举
export enum GridTemplateType {
    SINGLE = 'single',
    VERTICAL_1x1 = 'vertical-1x1',
    HORIZONTAL_1x1 = 'horizontal-1x1',
    VERTICAL_1x2 = 'vertical-1x2',
    HORIZONTAL_1x2 = 'horizontal-1x2',
    GRID_2x2 = 'grid-2x2',
    VERTICAL_1x1x1 = "vertical-1x1x1",
    HORIZONTAL_1x1x1 = "horizontal-1x1x1"
}

export const gridTemplates: Record<GridTemplateType, GridTemplateConfig> = {
    [GridTemplateType.SINGLE]: {
        gridTemplateAreas: '"a"',
        gridTemplateColumns: '1fr',
        gridTemplateRows: '1fr'
    },
    [GridTemplateType.VERTICAL_1x1]: {
        gridTemplateAreas: '"a" "b"',
        gridTemplateColumns: '1fr',
        gridTemplateRows: '1fr 1fr'
    },
    [GridTemplateType.HORIZONTAL_1x1]: {
        gridTemplateAreas: '"a b"',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr'
    },
    [GridTemplateType.VERTICAL_1x2]: {
        gridTemplateAreas: '"a a" "b c"',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr'
    },
    [GridTemplateType.HORIZONTAL_1x2]: {
        gridTemplateAreas: '"a b" "a c"',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr'
    },
    [GridTemplateType.GRID_2x2]: {
        gridTemplateAreas: '"a b" "c d"',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr'
    },
    [GridTemplateType.VERTICAL_1x1x1]: {
        gridTemplateAreas: '"a" "b" "c"',
        gridTemplateColumns: '1fr',
        gridTemplateRows: '1fr 1fr 1fr'
    },

    [GridTemplateType.HORIZONTAL_1x1x1]: {
        gridTemplateAreas: '"a b c"',
        gridTemplateColumns: '1fr 1fr 1fr',
        gridTemplateRows: '1fr'
    },
};
