import '@testing-library/jest-dom';

// jsdom에는 ResizeObserver가 없음. @xyflow/react가 마운트 시 사용하므로 polyfill.
if (typeof global.ResizeObserver === 'undefined') {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// SVGElement.getBBox mock — React Flow가 내부적으로 호출
if (typeof SVGElement !== 'undefined' && !SVGElement.prototype.getBBox) {
  SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 });
}
