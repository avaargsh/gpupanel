import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

export interface EChartProps {
    option: echarts.EChartsOption;
    height?: number | string;
    /** 当主题变化时重建实例 */
    themeKey?: string;
}

/**
 * 轻量 ECharts 封装（对齐 Docker Desktop 使用图表库的做法，这里沿用后端生态常用的 ECharts）。
 *
 * 图表仅在容器具备非零尺寸后初始化，避免在隐藏/未布局的标签页中触发
 * “Can't get DOM width or height” 警告；随后由 ResizeObserver 负责尺寸自适应。
 */
export default function EChart({ option, height = 260, themeKey }: EChartProps) {
    const ref = useRef<HTMLDivElement>(null);
    const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);
    const optionRef = useRef(option);
    optionRef.current = option;

    const ensureChart = () => {
        const el = ref.current;
        if (!el) return;
        if (chartRef.current) return;
        if (!el.clientWidth || !el.clientHeight) return;
        // 使用 themeKey（'light' | 'dark'）切换 ECharts 内置主题，避免暗色模式下图表仍用亮色画布。
        const theme = themeKey === 'dark' ? 'dark' : undefined;
        const chart = echarts.init(el, theme, { renderer: 'canvas' });
        chart.setOption(optionRef.current, true);
        chartRef.current = chart;
    };

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        ensureChart();
        const observer = new ResizeObserver(() => {
            if (chartRef.current) chartRef.current.resize();
            else ensureChart();
        });
        observer.observe(el);

        const onResize = () => chartRef.current?.resize();
        window.addEventListener('resize', onResize);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', onResize);
            chartRef.current?.dispose();
            chartRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [themeKey]);

    useEffect(() => {
        if (chartRef.current) {
            chartRef.current.setOption(option, true);
        } else {
            ensureChart();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [option]);

    return <div ref={ref} style={{ width: '100%', height }} />;
}
