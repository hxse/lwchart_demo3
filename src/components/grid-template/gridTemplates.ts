// Grid模板配置字典
export interface GridTemplateConfig {
    gridTemplateAreas: string;
    gridTemplateColumns: string;
    gridTemplateRows: string;
    slots: number; // Number of available main slots (excluding bottom row if added dynamically)
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
        gridTemplateRows: '1fr',
        slots: 1
    },
    [GridTemplateType.VERTICAL_1x1]: {
        gridTemplateAreas: '"a" "b"',
        gridTemplateColumns: '1fr',
        gridTemplateRows: '1fr 1fr',
        slots: 2
    },
    [GridTemplateType.HORIZONTAL_1x1]: {
        gridTemplateAreas: '"a b"',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr',
        slots: 2
    },
    [GridTemplateType.VERTICAL_1x2]: {
        gridTemplateAreas: '"a a" "b c"',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        slots: 3
    },
    [GridTemplateType.HORIZONTAL_1x2]: {
        gridTemplateAreas: '"a b" "a c"',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        slots: 3
    },
    [GridTemplateType.GRID_2x2]: {
        gridTemplateAreas: '"a b" "c d"',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        slots: 4
    },
    [GridTemplateType.VERTICAL_1x1x1]: {
        gridTemplateAreas: '"a" "b" "c"',
        gridTemplateColumns: '1fr',
        gridTemplateRows: '1fr 1fr 1fr',
        slots: 3
    },

    [GridTemplateType.HORIZONTAL_1x1x1]: {
        gridTemplateAreas: '"a b c"',
        gridTemplateColumns: '1fr 1fr 1fr',
        gridTemplateRows: '1fr',
        slots: 3
    },
};
