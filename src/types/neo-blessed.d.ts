/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'neo-blessed' {
  namespace Widgets {
    interface Screen {
      program: any;
      render(): void;
      destroy(): void;
      key(keys: string | string[], callback: () => void): void;
      unkey(keys: string | string[]): void;
      append(element: any): void;
      remove(element: any): void;
    }

    interface BoxElement {
      setContent(content: string): void;
      show(): void;
      hide(): void;
      focus(): void;
      scrollTo(index: number): void;
      scroll(offset: number): void;
      getScrollHeight(): number;
      getScrollPerc(): number;
      setScrollPerc(perc: number): void;
      on(event: string, callback: (...args: any[]) => void): void;
      key(keys: string | string[], callback: () => void): void;
    }

    interface TextElement {
      setContent(content: string): void;
    }
  }

  function screen(options?: any): Widgets.Screen;
  function box(options?: any): Widgets.BoxElement;
  function text(options?: any): Widgets.TextElement;
}
