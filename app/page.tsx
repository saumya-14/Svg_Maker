/**
 * SVG Editor Demo with Path Editing Support
 * 
 * This component provides a full-featured SVG editor with support for:
 * - Rectangles and Circles (basic shapes)
 * - Paths with pen tool (advanced vector editing)
 * 
 * Path Format:
 * - Paths are stored with both a `d` attribute (SVG path string) and a `commands` array
 * - The `commands` array contains structured data for editing (anchors + bezier handles)
 * - Commands support: M (moveTo), L (lineTo), C (cubic bezier), Z (closePath)
 * - When editing, we update `commands` and regenerate `d` using `commandsToD()`
 * - When user edits `d` directly, we parse it to `commands` using `dToCommands()`
 * 
 * Testing Steps:
 * 1. Pen Tool: Click pen tool, click canvas 3 times, drag on 3rd click to create curve
 * 2. Selection: Click on a path to select it - should show anchor handles
 * 3. Edit Anchors: Drag anchor circles to move path points
 * 4. Edit Handles: Drag bezier handle circles to adjust curves
 * 5. Edit D Attribute: Select path, edit `d` in properties panel, click "Update Path"
 * 6. Export/Import: Click Export, copy JSON, clear canvas, click Import, paste JSON
 */

"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Square, Circle, Trash2, Move, PenTool, Download, Upload, CircleDot, Hexagon, Star } from 'lucide-react';

// Types
type ToolType = 'select' | 'rect' | 'circle' | 'ellipse' | 'polygon' | 'star' | 'pen';

/**
 * PathCommand represents a single command in an SVG path
 * Supports: M (moveTo), L (lineTo), C (cubic bezier), Z (closePath)
 */
interface PathCommand {
  cmd: 'M' | 'L' | 'C' | 'Z';
  // For M/L: anchor point
  x?: number;
  y?: number;
  // For C: control points and end point
  x1?: number; // Control point 1 (before anchor)
  y1?: number;
  x2?: number; // Control point 2 (after anchor)
  y2?: number;
}

interface RectShape {
  id: string;
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  fillGradientId?: string; // ID of gradient to use for fill
  strokeGradientId?: string; // ID of gradient to use for stroke
  selected?: boolean;
}

interface CircleShape {
  id: string;
  type: 'circle';
  x: number;
  y: number;
  cx: number;
  cy: number;
  r: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  fillGradientId?: string;
  strokeGradientId?: string;
  selected?: boolean;
}

interface EllipseShape {
  id: string;
  type: 'ellipse';
  x: number;
  y: number;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  fillGradientId?: string;
  strokeGradientId?: string;
  selected?: boolean;
}

interface PolygonShape {
  id: string;
  type: 'polygon';
  x: number;
  y: number;
  points: Array<{ x: number; y: number }>; // Array of point coordinates
  fill: string;
  stroke: string;
  strokeWidth: number;
  fillGradientId?: string;
  strokeGradientId?: string;
  selected?: boolean;
}

interface PathShape {
  id: string;
  type: 'path';
  x: number; // Not used for paths, kept for compatibility
  y: number; // Not used for paths, kept for compatibility
  d: string; // SVG path data string
  commands: PathCommand[]; // Structured command data for editing
  fill: string;
  stroke: string;
  strokeWidth: number;
  fillGradientId?: string;
  strokeGradientId?: string;
  selected?: boolean;
}

type SVGShape = RectShape | CircleShape | EllipseShape | PolygonShape | PathShape;

// Gradient definitions
interface GradientStop {
  offset: number; // 0-100
  color: string;
}

interface LinearGradientDef {
  id: string;
  name: string;
  x1: string; // Percentage or number
  y1: string;
  x2: string;
  y2: string;
  stops: GradientStop[];
}

export default function SVGEditorDemo() {
  const [tool, setTool] = useState<ToolType>('select');
  const [shapes, setShapes] = useState<SVGShape[]>([]);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingHandle, setIsDraggingHandle] = useState<{
    shapeId: string;
    cmdIndex: number;
    handleType: 'anchor' | 'handle1' | 'handle2';
  } | null>(null);
  const [isDraggingPolygonVertex, setIsDraggingPolygonVertex] = useState<{
    shapeId: string;
    vertexIndex: number;
  } | null>(null);
  const [currentPathId, setCurrentPathId] = useState<string | null>(null);
  const [isCurveMode, setIsCurveMode] = useState(false);
  const [isPenDragging, setIsPenDragging] = useState(false);
  const [penDragStart, setPenDragStart] = useState<{ x: number; y: number } | null>(null);
  const [penClickPoint, setPenClickPoint] = useState<{ x: number; y: number } | null>(null);
  const [hasMoved, setHasMoved] = useState(false);
  const [pathDError, setPathDError] = useState<string | null>(null);
  const [importText, setImportText] = useState('');
  const [hoveredPointIndex, setHoveredPointIndex] = useState<{ shapeId: string; cmdIndex: number } | null>(null);
  const [draggingFromPoint, setDraggingFromPoint] = useState<{ shapeId: string; cmdIndex: number; x: number; y: number } | null>(null);
  const [isConnectingPoints, setIsConnectingPoints] = useState(false);
  const [previewLineEnd, setPreviewLineEnd] = useState<{ x: number; y: number } | null>(null);
  const [hoveredTargetPoint, setHoveredTargetPoint] = useState<{ shapeId: string; cmdIndex: number; x: number; y: number } | null>(null);
  const [polygonSides, setPolygonSides] = useState<number>(5); // Default 5 sides (pentagon)
  const [starPoints, setStarPoints] = useState<number>(5); // Default 5 points
  const [starOuterRadius, setStarOuterRadius] = useState<number>(50); // Default outer radius
  const [starInnerRadius, setStarInnerRadius] = useState<number>(25); // Default inner radius
  const [gradients, setGradients] = useState<LinearGradientDef[]>([]);
  const [showGradientPanel, setShowGradientPanel] = useState<boolean>(false);
  const [editingGradient, setEditingGradient] = useState<string | null>(null);
  const canvasRef = useRef<SVGSVGElement>(null);
  const pathRefs = useRef<Map<string, SVGPathElement>>(new Map());

  // Get selected shape
  const selectedShape = shapes.find(s => s.id === selectedShapeId);

  /**
   * commandsToD: Converts PathCommand[] array to SVG path `d` string
   * Handles M, L, C, Z commands with proper formatting
   */
  const commandsToD = useCallback((commands: PathCommand[]): string => {
    if (commands.length === 0) return '';
    
    const parts: string[] = [];
    for (const cmd of commands) {
      switch (cmd.cmd) {
        case 'M':
          if (cmd.x !== undefined && cmd.y !== undefined) {
            parts.push(`M ${cmd.x} ${cmd.y}`);
          }
          break;
        case 'L':
          if (cmd.x !== undefined && cmd.y !== undefined) {
            parts.push(`L ${cmd.x} ${cmd.y}`);
          }
          break;
        case 'C':
          if (
            cmd.x1 !== undefined && cmd.y1 !== undefined &&
            cmd.x2 !== undefined && cmd.y2 !== undefined &&
            cmd.x !== undefined && cmd.y !== undefined
          ) {
            parts.push(`C ${cmd.x1} ${cmd.y1} ${cmd.x2} ${cmd.y2} ${cmd.x} ${cmd.y}`);
          }
          break;
        case 'Z':
          parts.push('Z');
          break;
      }
    }
    return parts.join(' ');
  }, []);

  /**
   * dToCommands: Parses SVG path `d` string into PathCommand[] array
   * Supports absolute M, L, C, Z commands (uppercase only for simplicity)
   */
  const dToCommands = useCallback((d: string): PathCommand[] | null => {
    try {
      const commands: PathCommand[] = [];
      // Remove extra whitespace and split by command letters
      const cleaned = d.trim().replace(/\s+/g, ' ');
      const tokens = cleaned.split(/(?=[MLCZ])/);
      
      for (const token of tokens) {
        const trimmed = token.trim();
        if (!trimmed) continue;
        
        const cmd = trimmed[0] as 'M' | 'L' | 'C' | 'Z';
        const coords = trimmed.slice(1).trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
        
        switch (cmd) {
          case 'M':
            if (coords.length >= 2) {
              commands.push({ cmd: 'M', x: coords[0], y: coords[1] });
            }
            break;
          case 'L':
            if (coords.length >= 2) {
              commands.push({ cmd: 'L', x: coords[0], y: coords[1] });
            }
            break;
          case 'C':
            if (coords.length >= 6) {
              commands.push({
                cmd: 'C',
                x1: coords[0],
                y1: coords[1],
                x2: coords[2],
                y2: coords[3],
                x: coords[4],
                y: coords[5],
              });
            }
            break;
          case 'Z':
            commands.push({ cmd: 'Z' });
            break;
        }
      }
      
      return commands.length > 0 ? commands : null;
    } catch (error) {
      console.error('Failed to parse path d:', error);
      return null;
    }
  }, []);

  /**
   * hitTestPath: Tests if a point (x, y) is on or near a path
   * Uses SVGPathElement.isPointInStroke for accurate hit testing
   */
  const hitTestPath = useCallback((pathElement: SVGPathElement, x: number, y: number, strokeWidth: number): boolean => {
    try {
      // Create a temporary SVG context for hit testing
      const svg = pathElement.ownerSVGElement;
      if (!svg) return false;
      
      // Use isPointInStroke if available (modern browsers)
      if (typeof (pathElement as any).isPointInStroke === 'function') {
        return (pathElement as any).isPointInStroke(x, y);
      }
      
      // Fallback: check if point is within strokeWidth distance from path
      // Sample points along path and check distance
      const totalLength = pathElement.getTotalLength();
      const samples = Math.max(10, Math.floor(totalLength / 10));
      const threshold = strokeWidth / 2 + 5; // Add 5px tolerance
      
      for (let i = 0; i <= samples; i++) {
        const point = pathElement.getPointAtLength((totalLength * i) / samples);
        const dx = point.x - x;
        const dy = point.y - y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= threshold) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }, []);

  /**
   * createRegularPolygon: Creates a regular polygon with specified number of sides
   * @param centerX - X coordinate of center
   * @param centerY - Y coordinate of center
   * @param sides - Number of sides (minimum 3)
   * @param radius - Radius of the polygon (default 50)
   * @returns Array of point coordinates
   */
  const createRegularPolygon = useCallback((centerX: number, centerY: number, sides: number, radius: number = 50): Array<{ x: number; y: number }> => {
    const points: Array<{ x: number; y: number }> = [];
    const numSides = Math.max(3, Math.floor(sides)); // Ensure at least 3 sides
    
    for (let i = 0; i < numSides; i++) {
      // Calculate angle for each vertex
      // Start from top (12 o'clock) and go clockwise
      const angle = (Math.PI / 2) + (2 * Math.PI * i) / numSides;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      points.push({ x, y });
    }
    
    return points;
  }, []);

  /**
   * createStar: Creates a star polygon with specified number of points
   * @param centerX - X coordinate of center
   * @param centerY - Y coordinate of center
   * @param points - Number of star points (minimum 5)
   * @param outerRadius - Outer radius of the star (default 50)
   * @param innerRadius - Inner radius of the star (default 25)
   * @returns Array of point coordinates
   */
  const createStar = useCallback((centerX: number, centerY: number, points: number, outerRadius: number = 50, innerRadius: number = 25): Array<{ x: number; y: number }> => {
    const starPoints: Array<{ x: number; y: number }> = [];
    const numPoints = Math.max(3, Math.floor(points)); // Ensure at least 5 points
    
    for (let i = 0; i < numPoints * 2; i++) {
      // Alternate between outer and inner radius
      const angle = (Math.PI / 2) + (Math.PI * i) / numPoints;
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      starPoints.push({ x, y });
    }
    
    return starPoints;
  }, []);

  /**
   * addPoint: Adds a new point (M command) to the current path or creates a new path
   */
  const addPoint = useCallback((x: number, y: number) => {
    if (!currentPathId) {
      // Create new path with first point
      const id = `path-${Date.now()}`;
      const newPath: PathShape = {
        id,
        type: 'path',
        x: 0,
        y: 0,
        d: `M ${x} ${y}`,
        commands: [{ cmd: 'M', x, y }],
        fill: 'none',
        stroke: '#3B82F6',
        strokeWidth: 2,
        selected: true,
      };
      
      setShapes(prev => [...prev, newPath]);
      setSelectedShapeId(id);
      setCurrentPathId(id);
    } else {
      // Add new M command (new point) to existing path
      setShapes(prev => prev.map(shape => {
        if (shape.id === currentPathId && shape.type === 'path') {
          const newCmd: PathCommand = { cmd: 'M', x, y };
          const newCommands: PathCommand[] = [...shape.commands, newCmd];
          const newD = commandsToD(newCommands);
          return { ...shape, commands: newCommands, d: newD };
        }
        return shape;
      }));
    }
  }, [currentPathId, commandsToD]);

  /**
   * convertLineToCurve: Converts an L command to a C command
   * Finds the previous M or C command to get the start point
   */
  const convertLineToCurve = useCallback((shapeId: string, lineIndex: number) => {
    setShapes(prev => prev.map(shape => {
      if (shape.id === shapeId && shape.type === 'path') {
        const lineCmd = shape.commands[lineIndex];
        if (!lineCmd || lineCmd.cmd !== 'L') return shape;
        
        // Find the previous command (M or C) to get start point
        let startX = 0;
        let startY = 0;
        for (let i = lineIndex - 1; i >= 0; i--) {
          const prevCmd = shape.commands[i];
          if (prevCmd.cmd === 'M') {
            startX = prevCmd.x!;
            startY = prevCmd.y!;
            break;
          } else if (prevCmd.cmd === 'C') {
            startX = prevCmd.x!;
            startY = prevCmd.y!;
            break;
          } else if (prevCmd.cmd === 'L') {
            // If previous is also L, we need to trace back further
            continue;
          }
        }
        
        const endX = lineCmd.x!;
        const endY = lineCmd.y!;
        
        // Calculate control points - create a smooth curve
        // Control points are positioned at 1/3 and 2/3 of the line
        const dx = endX - startX;
        const dy = endY - startY;
        
        const x1 = startX + dx * 0.33;
        const y1 = startY + dy * 0.33;
        const x2 = startX + dx * 0.67;
        const y2 = startY + dy * 0.67;
        
        const curveCmd: PathCommand = { cmd: 'C', x1, y1, x2, y2, x: endX, y: endY };
        
        const newCommands = [
          ...shape.commands.slice(0, lineIndex),
          curveCmd,
          ...shape.commands.slice(lineIndex + 1)
        ];
        
        const newD = commandsToD(newCommands);
        return { ...shape, commands: newCommands, d: newD };
      }
      return shape;
    }));
  }, [commandsToD]);

  /**
   * connectPoints: Connects two points with a line (L) or curve (C) command
   * fromPointIndex: index of the M command to connect from
   * toX, toY: target coordinates (can be another point or free position)
   * isCurve: whether to create a curve or line
   */
  const connectPoints = useCallback((shapeId: string, fromPointIndex: number, toX: number, toY: number, isCurve: boolean, dragStart?: { x: number; y: number }) => {
    setShapes(prev => prev.map(shape => {
      if (shape.id === shapeId && shape.type === 'path') {
        const fromCmd = shape.commands[fromPointIndex];
        if (!fromCmd || fromCmd.cmd !== 'M') return shape;
        
        const fromX = fromCmd.x!;
        const fromY = fromCmd.y!;
        
        // Check if connection already exists (find L or C after this M)
        let connectionIndex = -1;
        for (let i = fromPointIndex + 1; i < shape.commands.length; i++) {
          const cmd = shape.commands[i];
          if (cmd.cmd === 'M') break; // Hit next point, no connection
          if (cmd.cmd === 'L' || cmd.cmd === 'C') {
            connectionIndex = i;
            break;
          }
        }
        
        let newCommands: PathCommand[];
        
        if (isCurve && dragStart) {
          // Create curve: calculate control points
          const dx1 = dragStart.x - fromX;
          const dy1 = dragStart.y - fromY;
          const dx2 = toX - dragStart.x;
          const dy2 = toY - dragStart.y;
          
          const x1 = fromX + dx1 * 0.5;
          const y1 = fromY + dy1 * 0.5;
          const x2 = toX - dx2 * 0.5;
          const y2 = toY - dy2 * 0.5;
          
          const curveCmd: PathCommand = { cmd: 'C', x1, y1, x2, y2, x: toX, y: toY };
          
          if (connectionIndex >= 0) {
            // Replace existing connection
            newCommands = [
              ...shape.commands.slice(0, connectionIndex),
              curveCmd,
              ...shape.commands.slice(connectionIndex + 1)
            ];
          } else {
            // Insert new connection after the M command
            newCommands = [
              ...shape.commands.slice(0, fromPointIndex + 1),
              curveCmd,
              ...shape.commands.slice(fromPointIndex + 1)
            ];
          }
        } else {
          // Create line
          const lineCmd: PathCommand = { cmd: 'L', x: toX, y: toY };
          
          if (connectionIndex >= 0) {
            // Replace existing connection
            newCommands = [
              ...shape.commands.slice(0, connectionIndex),
              lineCmd,
              ...shape.commands.slice(connectionIndex + 1)
            ];
          } else {
            // Insert new connection after the M command
            newCommands = [
              ...shape.commands.slice(0, fromPointIndex + 1),
              lineCmd,
              ...shape.commands.slice(fromPointIndex + 1)
            ];
          }
        }
        
        const newD = commandsToD(newCommands);
        return { ...shape, commands: newCommands, d: newD };
      }
      return shape;
    }));
  }, [commandsToD]);

  /**
   * finishPath: Completes the current path (adds Z if needed, stops drawing)
   */
  const finishPath = useCallback(() => {
    if (!currentPathId) return;
    
    setShapes(prev => prev.map(shape => {
      if (shape.id === currentPathId && shape.type === 'path') {
        // Optionally add Z to close path
        // For now, we'll leave it open
        return shape;
      }
      return shape;
    }));
    
    setCurrentPathId(null);
    setIsDrawing(false);
    setStartPoint(null);
  }, [currentPathId]);

  /**
   * startHandleDrag: Begins dragging an anchor or bezier handle
   */
  const startHandleDrag = useCallback((shapeId: string, cmdIndex: number, handleType: 'anchor' | 'handle1' | 'handle2') => {
    setIsDraggingHandle({ shapeId, cmdIndex, handleType });
  }, []);

  /**
   * updateHandle: Updates the position of a dragged anchor or handle
   */
  const updateHandle = useCallback((x: number, y: number) => {
    if (!isDraggingHandle || !canvasRef.current) return;
    
    const { shapeId, cmdIndex, handleType } = isDraggingHandle;
    
    setShapes(prev => prev.map(shape => {
      if (shape.id === shapeId && shape.type === 'path') {
        const newCommands = [...shape.commands];
        const cmd = newCommands[cmdIndex];
        
        if (!cmd) return shape;
        
        if (handleType === 'anchor') {
          // Update anchor point
          if (cmd.cmd === 'M' || cmd.cmd === 'L') {
            newCommands[cmdIndex] = { ...cmd, x, y };
          } else if (cmd.cmd === 'C') {
            // Update end point of curve
            newCommands[cmdIndex] = { ...cmd, x, y };
          }
        } else if (handleType === 'handle1' && cmd.cmd === 'C') {
          // Update first control point
          newCommands[cmdIndex] = { ...cmd, x1: x, y1: y };
        } else if (handleType === 'handle2' && cmd.cmd === 'C') {
          // Update second control point
          newCommands[cmdIndex] = { ...cmd, x2: x, y2: y };
        }
        
        const newD = commandsToD(newCommands);
        return { ...shape, commands: newCommands, d: newD };
      }
      return shape;
    }));
  }, [isDraggingHandle, commandsToD]);

  // Handle canvas click
  const handleCanvasClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (tool === 'select') {
      // Find clicked shape
      const clickedShape = shapes.find(shape => {
        if (shape.type === 'rect' && shape.width && shape.height) {
          return x >= shape.x && x <= shape.x + shape.width &&
                 y >= shape.y && y <= shape.y + shape.height;
        }
        if (shape.type === 'circle' && shape.r) {
          const dx = x - (shape.cx || 0);
          const dy = y - (shape.cy || 0);
          return Math.sqrt(dx * dx + dy * dy) <= shape.r;
        }
        if (shape.type === 'ellipse' && shape.rx !== undefined && shape.ry !== undefined) {
          const dx = x - (shape.cx || 0);
          const dy = y - (shape.cy || 0);
          const rx = shape.rx || 0;
          const ry = shape.ry || 0;
          // Ellipse equation: ((x-cx)/rx)² + ((y-cy)/ry)² <= 1
          return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
        }
        if (shape.type === 'polygon' && shape.points && shape.points.length >= 3) {
          // Use point-in-polygon algorithm (ray casting)
          let inside = false;
          for (let i = 0, j = shape.points.length - 1; i < shape.points.length; j = i++) {
            const xi = shape.points[i].x;
            const yi = shape.points[i].y;
            const xj = shape.points[j].x;
            const yj = shape.points[j].y;
            
            const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
          }
          return inside;
        }
        if (shape.type === 'path') {
          const pathElement = pathRefs.current.get(shape.id);
          if (pathElement) {
            return hitTestPath(pathElement, x, y, shape.strokeWidth);
          }
        }
        return false;
      });

      setSelectedShapeId(clickedShape?.id || null);
      setShapes(prev => prev.map(s => ({ ...s, selected: s.id === clickedShape?.id })));
    } else if (tool === 'pen') {
      // Handle double-click to finish path
      if (e.detail === 2) {
        finishPath();
        return;
      }
      
      // Check if clicking on an existing point
      let clickedPointIndex = -1;
      let clickedShapeId: string | null = null;
      
      if (currentPathId) {
        const currentPath = shapes.find(s => s.id === currentPathId && s.type === 'path');
        if (currentPath && currentPath.type === 'path') {
          // Check if click is near any M command point
          for (let i = 0; i < currentPath.commands.length; i++) {
            const cmd = currentPath.commands[i];
            if (cmd.cmd === 'M' && cmd.x !== undefined && cmd.y !== undefined) {
              const dx = x - cmd.x;
              const dy = y - cmd.y;
              const distance = Math.sqrt(dx * dx + dy * dy);
              if (distance <= 10) { // 10px tolerance
                clickedPointIndex = i;
                clickedShapeId = currentPath.id;
                break;
              }
            }
          }
        }
      }
      
      if (clickedPointIndex >= 0 && clickedShapeId) {
        // Clicked on existing point - start dragging from it
        const pathShape = shapes.find(s => s.id === clickedShapeId && s.type === 'path');
        if (pathShape && pathShape.type === 'path') {
          const cmd = pathShape.commands[clickedPointIndex];
          if (cmd && cmd.cmd === 'M') {
            setDraggingFromPoint({
              shapeId: clickedShapeId,
              cmdIndex: clickedPointIndex,
              x: cmd.x!,
              y: cmd.y!
            });
            setIsConnectingPoints(true);
            setPenDragStart({ x, y });
          }
        }
      } else {
        // Click on empty space - add new point (M command)
        addPoint(x, y);
      }
    } else if (tool === 'polygon') {
      // Create polygon with specified number of sides
      const points = createRegularPolygon(x, y, polygonSides, 50);
      const newShape: PolygonShape = {
        id: `polygon-${Date.now()}`,
        type: 'polygon',
        x: 0,
        y: 0,
        points,
        fill: '#3B82F6',
        stroke: '#1E40AF',
        strokeWidth: 2,
        selected: true,
      };
      setShapes(prev => [...prev, newShape]);
      setSelectedShapeId(newShape.id);
    } else if (tool === 'star') {
      // Create star with specified number of points
      const points = createStar(x, y, starPoints, starOuterRadius, starInnerRadius);
      const newShape: PolygonShape = {
        id: `star-${Date.now()}`,
        type: 'polygon',
        x: 0,
        y: 0,
        points,
        fill: '#3B82F6',
        stroke: '#1E40AF',
        strokeWidth: 2,
        selected: true,
      };
      setShapes(prev => [...prev, newShape]);
      setSelectedShapeId(newShape.id);
    } else if (tool === 'rect' || tool === 'circle' || tool === 'ellipse') {
      // Start drawing
      setIsDrawing(true);
      setStartPoint({ x, y });
    }
  }, [tool, shapes, currentPathId, addPoint, finishPath, hitTestPath, isCurveMode, polygonSides, createRegularPolygon, starPoints, starOuterRadius, starInnerRadius, createStar]);

  // Handle mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Handle handle dragging
    if (isDraggingHandle) {
      updateHandle(x, y);
      return;
    }

    // Handle polygon vertex dragging
    if (isDraggingPolygonVertex) {
      setShapes(prev => prev.map(shape => {
        if (shape.id === isDraggingPolygonVertex.shapeId && shape.type === 'polygon') {
          const newPoints = [...shape.points];
          newPoints[isDraggingPolygonVertex.vertexIndex] = { x, y };
          return { ...shape, points: newPoints };
        }
        return shape;
      }));
      return;
    }

      // Handle pen tool - connecting points
  if (tool === 'pen' && isConnectingPoints && draggingFromPoint) {
    // Check if mouse is hovering over another point
    let targetPoint: { shapeId: string; cmdIndex: number; x: number; y: number } | null = null;
    
    if (currentPathId) {
      const currentPath = shapes.find(s => s.id === currentPathId && s.type === 'path');
      if (currentPath && currentPath.type === 'path') {
        // Check if mouse is near any M command point (except the one we're dragging from)
        for (let i = 0; i < currentPath.commands.length; i++) {
          const cmd = currentPath.commands[i];
          if (cmd.cmd === 'M' && cmd.x !== undefined && cmd.y !== undefined) {
            // Skip the point we're dragging from
            if (draggingFromPoint.shapeId === currentPath.id && draggingFromPoint.cmdIndex === i) {
              continue;
            }
            
            const dx = x - cmd.x;
            const dy = y - cmd.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= 15) { // 15px tolerance for snapping
              targetPoint = {
                shapeId: currentPath.id,
                cmdIndex: i,
                x: cmd.x,
                y: cmd.y
              };
              break;
            }
          }
        }
      }
    }
    
    setHoveredTargetPoint(targetPoint);
    
    // Update preview line end (use target point if hovering, otherwise use mouse position)
    const endPoint = targetPoint ? { x: targetPoint.x, y: targetPoint.y } : { x, y };
    setPreviewLineEnd(endPoint);
    
    if (penDragStart) {
      // Check if mouse has moved significantly (dragging)
      const dx = x - penDragStart.x;
      const dy = y - penDragStart.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > 5) {
        // Significant movement - create connection
        setHasMoved(true);
        setIsPenDragging(true);
        // Use Shift key to toggle curve mode, or check isCurveMode
        const makeCurve = e.shiftKey || isCurveMode;
        // Use target point if hovering, otherwise use mouse position
        connectPoints(draggingFromPoint.shapeId, draggingFromPoint.cmdIndex, endPoint.x, endPoint.y, makeCurve, penDragStart);
      }
    }
    return; // Exit early for pen tool
  }

    if (!isDrawing || !startPoint) return;

    if (tool === 'rect') {
      const width = Math.abs(x - startPoint.x);
      const height = Math.abs(y - startPoint.y);
      const newX = Math.min(startPoint.x, x);
      const newY = Math.min(startPoint.y, y);

      // Update or create rectangle
      const existingIndex = shapes.findIndex(s => s.selected && s.type === 'rect');
      if (existingIndex >= 0) {
        setShapes(prev => {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            x: newX,
            y: newY,
            width,
            height,
          } as RectShape;
          return updated;
        });
      } else {
        const newShape: RectShape = {
          id: `rect-${Date.now()}`,
          type: 'rect',
          x: newX,
          y: newY,
          width,
          height,
          fill: '#3B82F6',
          stroke: '#1E40AF',
          strokeWidth: 2,
          selected: true,
        };
        setShapes(prev => [...prev, newShape]);
        setSelectedShapeId(newShape.id);
      }
    } else if (tool === 'circle') {
      const dx = x - startPoint.x;
      const dy = y - startPoint.y;
      const radius = Math.sqrt(dx * dx + dy * dy);

      const existingIndex = shapes.findIndex(s => s.selected && s.type === 'circle');
      if (existingIndex >= 0) {
        setShapes(prev => {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            cx: startPoint.x,
            cy: startPoint.y,
            r: radius,
          } as CircleShape;
          return updated;
        });
      } else {
        const newShape: CircleShape = {
          id: `circle-${Date.now()}`,
          type: 'circle',
          cx: startPoint.x,
          cy: startPoint.y,
          r: radius,
          x: 0,
          y: 0,
          fill: '#3B82F6',
          stroke: '#1E40AF',
          strokeWidth: 2,
          selected: true,
        };
        setShapes(prev => [...prev, newShape]);
        setSelectedShapeId(newShape.id);
      }
    } else if (tool === 'ellipse') {
      const dx = x - startPoint.x;
      const dy = y - startPoint.y;
      const rx = Math.abs(dx);
      const ry = Math.abs(dy);

      const existingIndex = shapes.findIndex(s => s.selected && s.type === 'ellipse');
      if (existingIndex >= 0) {
        setShapes(prev => {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            cx: startPoint.x,
            cy: startPoint.y,
            rx,
            ry,
          } as EllipseShape;
          return updated;
        });
      } else {
        const newShape: EllipseShape = {
          id: `ellipse-${Date.now()}`,
          type: 'ellipse',
          cx: startPoint.x,
          cy: startPoint.y,
          rx,
          ry,
          x: 0,
          y: 0,
          fill: '#3B82F6',
          stroke: '#1E40AF',
          strokeWidth: 2,
          selected: true,
        };
        setShapes(prev => [...prev, newShape]);
        setSelectedShapeId(newShape.id);
      }
    }
  }, [isDrawing, startPoint, tool, shapes, currentPathId, isDraggingHandle, updateHandle, isConnectingPoints, draggingFromPoint, penDragStart, isCurveMode, connectPoints]);

  // Handle mouse down (for pen tool dragging)
  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (tool === 'pen' && draggingFromPoint && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setPenDragStart({ x, y });
      setHasMoved(false);
    }
  }, [tool, draggingFromPoint]);

  // Handle mouse up
  const handleMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (tool === 'pen' && isConnectingPoints && draggingFromPoint && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // If hovering over a target point, connect to that point
      const targetPoint = hoveredTargetPoint ? { x: hoveredTargetPoint.x, y: hoveredTargetPoint.y } : { x, y };
      
      if (!hasMoved && draggingFromPoint) {
        // No significant movement - create line connection
        connectPoints(draggingFromPoint.shapeId, draggingFromPoint.cmdIndex, targetPoint.x, targetPoint.y, false);
      } else if (hasMoved && hoveredTargetPoint && penDragStart) {
        // If we were dragging and hovering over a point, finalize connection to that point
        const makeCurve = e.shiftKey || isCurveMode;
        connectPoints(draggingFromPoint.shapeId, draggingFromPoint.cmdIndex, targetPoint.x, targetPoint.y, makeCurve, penDragStart);
      }
      // If hasMoved and no target point, the connection was already added during drag
      
      setIsPenDragging(false);
      setIsConnectingPoints(false);
      setDraggingFromPoint(null);
      setPenDragStart(null);
      setPreviewLineEnd(null);
      setHoveredTargetPoint(null);
      setHasMoved(false);
    } else if (tool !== 'pen') {
      setIsDrawing(false);
      setStartPoint(null);
    }
    setIsDraggingHandle(null);
    setIsDraggingPolygonVertex(null);
  }, [tool, isConnectingPoints, draggingFromPoint, hasMoved, connectPoints, hoveredTargetPoint, isCurveMode, penDragStart, currentPathId, shapes]);

  // Handle Enter key to finish path
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && tool === 'pen' && currentPathId) {
        finishPath();
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [tool, currentPathId, finishPath]);

  // Delete selected shape
  const handleDelete = () => {
    if (selectedShapeId) {
      setShapes(prev => prev.filter(s => s.id !== selectedShapeId));
      setSelectedShapeId(null);
      if (currentPathId === selectedShapeId) {
        setCurrentPathId(null);
        setIsDrawing(false);
      }
    }
  };

  // Update shape properties
  const updateShapeProperty = (key: string, value: any) => {
    if (!selectedShapeId) return;
    setShapes(prev => prev.map(s => 
      s.id === selectedShapeId ? { ...s, [key]: value } : s
    ));
  };

  // Update path d attribute
  const updatePathD = (d: string) => {
    if (!selectedShapeId) return;
    
    const commands = dToCommands(d);
    if (commands) {
      setPathDError(null);
      setShapes(prev => prev.map(s => {
        if (s.id === selectedShapeId && s.type === 'path') {
          return { ...s, d, commands };
        }
        return s;
      }));
    } else {
      setPathDError('Invalid path data. Supported: M, L, C, Z (absolute only)');
    }
  };

  // Export shapes to JSON
  const handleExport = async () => {
    try {
      const json = JSON.stringify(shapes, null, 2);
      await navigator.clipboard.writeText(json);
      alert('Shapes exported to clipboard!');
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export. Check console for details.');
    }
  };

  // Import shapes from JSON
  const handleImport = () => {
    try {
      const parsed = JSON.parse(importText);
      if (Array.isArray(parsed)) {
        // Validate shapes
        const validShapes = parsed.filter((s: any) => 
          s && s.id && s.type && (s.type === 'rect' || s.type === 'circle' || s.type === 'ellipse' || s.type === 'polygon' || s.type === 'path')
        );
        setShapes(validShapes);
        setSelectedShapeId(null);
        setImportText('');
        alert(`Imported ${validShapes.length} shapes`);
      } else {
        alert('Invalid format. Expected array of shapes.');
      }
    } catch (error) {
      alert('Failed to parse JSON. Check format.');
    }
  };

  // Create a new linear gradient
  const createLinearGradient = (type: 'horizontal' | 'vertical' | 'angular', name: string) => {
    const id = `grad-${Date.now()}`;
    let x1 = '0%', y1 = '0%', x2 = '100%', y2 = '0%';
    
    if (type === 'vertical') {
      x1 = '0%';
      y1 = '0%';
      x2 = '0%';
      y2 = '100%';
    } else if (type === 'angular') {
      x1 = '0%';
      y1 = '100%';
      x2 = '100%';
      y2 = '0%';
    }
    
    const newGradient: LinearGradientDef = {
      id,
      name,
      x1,
      y1,
      x2,
      y2,
      stops: [
        { offset: 0, color: '#FFFF00' }, // Yellow
        { offset: 100, color: '#FF0000' }, // Red
      ],
    };
    setGradients(prev => [...prev, newGradient]);
    setEditingGradient(id);
    return id;
  };

  // Update gradient
  const updateGradient = (id: string, updates: Partial<LinearGradientDef>) => {
    setGradients(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g));
  };

  // Delete gradient
  const deleteGradient = (id: string) => {
    setGradients(prev => prev.filter(g => g.id !== id));
    // Remove gradient from all shapes using it
    setShapes(prev => prev.map(s => {
      if (s.fillGradientId === id) {
        return { ...s, fillGradientId: undefined };
      }
      if (s.strokeGradientId === id) {
        return { ...s, strokeGradientId: undefined };
      }
      return s;
    }));
    if (editingGradient === id) {
      setEditingGradient(null);
    }
  };

  // Add stop to gradient
  const addGradientStop = (gradientId: string) => {
    setGradients(prev => prev.map(g => {
      if (g.id === gradientId) {
        const newOffset = g.stops.length > 0 
          ? Math.min(100, g.stops[g.stops.length - 1].offset + 10)
          : 50;
        return {
          ...g,
          stops: [...g.stops, { offset: newOffset, color: '#FFFFFF' }]
        };
      }
      return g;
    }));
  };

  // Remove stop from gradient
  const removeGradientStop = (gradientId: string, stopIndex: number) => {
    setGradients(prev => prev.map(g => {
      if (g.id === gradientId && g.stops.length > 2) {
        return {
          ...g,
          stops: g.stops.filter((_, i) => i !== stopIndex)
        };
      }
      return g;
    }));
  };

  // Update gradient stop
  const updateGradientStop = (gradientId: string, stopIndex: number, updates: Partial<GradientStop>) => {
    setGradients(prev => prev.map(g => {
      if (g.id === gradientId) {
        const newStops = [...g.stops];
        newStops[stopIndex] = { ...newStops[stopIndex], ...updates };
        return { ...g, stops: newStops };
      }
      return g;
    }));
  };

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">SVG Editor Demo</h1>
          <p className="text-gray-400">Create and edit SVG shapes - Rectangle, Circle, Ellipse, Polygon, Star, and Path</p>
        </div>

        <div className="flex gap-6">
          {/* Toolbar */}
          <div className="w-64 bg-gray-900 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4">Tools</h2>
            <div className="space-y-2">
              <button
                onClick={() => {
                  setTool('select');
                  finishPath(); // Finish any active path
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                  tool === 'select'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                <Move size={20} />
                <span>Select</span>
              </button>
              <button
                onClick={() => {
                  setTool('rect');
                  finishPath();
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                  tool === 'rect'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                <Square size={20} />
                <span>Rectangle</span>
              </button>
              <button
                onClick={() => {
                  setTool('circle');
                  finishPath();
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                  tool === 'circle'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                <Circle size={20} />
                <span>Circle</span>
              </button>
              <button
                onClick={() => {
                  setTool('ellipse');
                  finishPath();
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                  tool === 'ellipse'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                <CircleDot size={20} />
                <span>Ellipse</span>
              </button>
              <button
                onClick={() => {
                  setTool('polygon');
                  finishPath();
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                  tool === 'polygon'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                <Hexagon size={20} />
                <span>Polygon</span>
              </button>
              <button
                onClick={() => {
                  setTool('star');
                  finishPath();
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                  tool === 'star'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                <Star size={20} />
                <span>Star</span>
              </button>
              <button
                onClick={() => setTool('pen')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                  tool === 'pen'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                <PenTool size={20} />
                <span>Pen</span>
              </button>
            </div>

            {/* Polygon Sides Input */}
            {tool === 'polygon' && (
              <div className="mt-4 p-3 bg-gray-800 rounded-lg">
                <label className="block text-sm text-gray-400 mb-2">Number of Sides</label>
                <input
                  type="number"
                  min="3"
                  max="20"
                  value={polygonSides}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 3;
                    setPolygonSides(Math.max(3, Math.min(20, value)));
                  }}
                  className="w-full px-3 py-2 bg-gray-700 rounded text-white text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">Enter number of sides (3-20), then click canvas to create</p>
              </div>
            )}

            {/* Star Configuration Input */}
            {tool === 'star' && (
              <div className="mt-4 p-3 bg-gray-800 rounded-lg space-y-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Number of Points</label>
                  <input
                    type="number"
                    min="3"
                    max="20"
                    value={starPoints}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 5;
                      setStarPoints(Math.max(3, Math.min(20, value)));
                    }}
                    className="w-full px-3 py-2 bg-gray-700 rounded text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Outer Radius</label>
                  <input
                    type="number"
                    min="10"
                    max="200"
                    value={starOuterRadius}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 50;
                      setStarOuterRadius(Math.max(10, Math.min(200, value)));
                    }}
                    className="w-full px-3 py-2 bg-gray-700 rounded text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Inner Radius</label>
                  <input
                    type="number"
                    min="5"
                    max="100"
                    value={starInnerRadius}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 25;
                      setStarInnerRadius(Math.max(5, Math.min(100, value)));
                    }}
                    className="w-full px-3 py-2 bg-gray-700 rounded text-white text-sm"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Configure star properties above, then click canvas to create</p>
              </div>
            )}

            {/* Gradient Management */}
            <div className="mt-6 p-3 bg-gray-800 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-300">Gradients</h3>
                <button
                  onClick={() => setShowGradientPanel(!showGradientPanel)}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  {showGradientPanel ? 'Hide' : 'Show'}
                </button>
              </div>
              
              {showGradientPanel && (
                <div className="space-y-4 mt-3">
                  {/* Create Gradient Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const name = prompt('Enter gradient name:') || `Gradient ${gradients.length + 1}`;
                        createLinearGradient('horizontal', name);
                      }}
                      className="flex-1 text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white"
                      title="Create Horizontal Gradient"
                    >
                      +Horizontal
                    </button>
                    <button
                      onClick={() => {
                        const name = prompt('Enter gradient name:') || `Gradient ${gradients.length + 1}`;
                        createLinearGradient('vertical', name);
                      }}
                      className="flex-1 text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white"
                      title="Create Vertical Gradient"
                    >
                      +Vertical
                    </button>
                    <button
                      onClick={() => {
                        const name = prompt('Enter gradient name:') || `Gradient ${gradients.length + 1}`;
                        createLinearGradient('angular', name);
                      }}
                      className="flex-1 text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white"
                      title="Create Angular Gradient"
                    >
                      +Angular
                    </button>
                  </div>

                  {/* Gradient List */}
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {gradients.map(grad => (
                      <div key={grad.id} className="bg-gray-700 rounded p-2">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-gray-300 font-medium">{grad.name}</span>
                          <div className="flex gap-1">
                            <button
                              onClick={() => setEditingGradient(editingGradient === grad.id ? null : grad.id)}
                              className="text-xs px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-white"
                            >
                              {editingGradient === grad.id ? 'Done' : 'Edit'}
                            </button>
                            <button
                              onClick={() => deleteGradient(grad.id)}
                              className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-white"
                            >
                              ×
                            </button>
                          </div>
                        </div>

                        {/* Gradient Preview */}
                        <div className="mb-2 h-8 rounded overflow-hidden border border-gray-600 relative" style={{
                          background: `linear-gradient(to right, ${grad.stops.sort((a, b) => a.offset - b.offset).map(s => `${s.color} ${s.offset}%`).join(', ')})`
                        }}>
                          {/* Show stop markers */}
                          {grad.stops.map((stop, idx) => (
                            <div
                              key={idx}
                              className="absolute top-0 bottom-0 w-0.5 bg-white opacity-50"
                              style={{ left: `${stop.offset}%` }}
                              title={`${stop.offset}% - ${stop.color}`}
                            />
                          ))}
                        </div>

                        {/* Gradient Editor */}
                        {editingGradient === grad.id && (
                          <div className="space-y-2 mt-2 pt-2 border-t border-gray-600">
                            {/* Gradient Direction */}
                            <div>
                              <label className="block text-xs text-gray-400 mb-1">Direction</label>
                              <select
                                value={`${grad.x1},${grad.y1},${grad.x2},${grad.y2}`}
                                onChange={(e) => {
                                  const [x1, y1, x2, y2] = e.target.value.split(',');
                                  updateGradient(grad.id, { x1, y1, x2, y2 });
                                }}
                                className="w-full px-2 py-1 bg-gray-600 rounded text-white text-xs"
                              >
                                <option value="0%,0%,100%,0%">Horizontal (Left to Right)</option>
                                <option value="0%,0%,0%,100%">Vertical (Top to Bottom)</option>
                                <option value="0%,100%,100%,0%">Angular (Top-Left to Bottom-Right)</option>
                                <option value="0%,0%,100%,100%">Diagonal (Top-Left to Bottom-Right)</option>
                              </select>
                            </div>

                            {/* Gradient Stops */}
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="block text-xs text-gray-400">Color Stops</label>
                                <button
                                  onClick={() => addGradientStop(grad.id)}
                                  className="text-xs px-2 py-0.5 bg-green-600 hover:bg-green-700 rounded text-white"
                                >
                                  +Stop
                                </button>
                              </div>
                              <div className="space-y-2">
                                {grad.stops.map((stop, index) => (
                                  <div key={index} className="bg-gray-600 rounded p-2">
                                    <div className="flex items-center gap-2 mb-2">
                                      {/* Color Preview Swatch */}
                                      <div 
                                        className="w-12 h-12 rounded border-2 border-gray-500 cursor-pointer relative overflow-hidden"
                                        style={{ backgroundColor: stop.color }}
                                        onClick={() => {
                                          const colorInput = document.createElement('input');
                                          colorInput.type = 'color';
                                          colorInput.value = stop.color;
                                          colorInput.onchange = (e: any) => {
                                            updateGradientStop(grad.id, index, { color: e.target.value });
                                          };
                                          colorInput.click();
                                        }}
                                        title="Click to pick color"
                                      />
                                      
                                      {/* Color Picker Button */}
                                      <div className="flex-1">
                                        <label className="block text-xs text-gray-300 mb-1">Color</label>
                                        <div className="flex gap-1 mb-1">
                                          <input
                                            type="color"
                                            value={stop.color}
                                            onChange={(e) => updateGradientStop(grad.id, index, { color: e.target.value })}
                                            className="w-10 h-8 rounded cursor-pointer border border-gray-500"
                                            title="Color picker"
                                          />
                                          <input
                                            type="text"
                                            value={stop.color}
                                            onChange={(e) => updateGradientStop(grad.id, index, { color: e.target.value })}
                                            className="flex-1 px-2 py-1 bg-gray-700 rounded text-white text-xs border border-gray-500"
                                            placeholder="#FFFFFF"
                                          />
                                        </div>
                                        {/* Quick Color Palette */}
                                        <div className="flex gap-1 flex-wrap">
                                          {['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFFFFF', '#000000', '#FFA500', '#800080', '#FFC0CB', '#A52A2A'].map((color) => (
                                            <button
                                              key={color}
                                              onClick={() => updateGradientStop(grad.id, index, { color })}
                                              className="w-6 h-6 rounded border border-gray-500 hover:scale-110 transition-transform"
                                              style={{ backgroundColor: color }}
                                              title={color}
                                            />
                                          ))}
                                        </div>
                                      </div>
                                      
                                      {/* Remove Button */}
                                      {grad.stops.length > 2 && (
                                        <button
                                          onClick={() => removeGradientStop(grad.id, index)}
                                          className="text-sm px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-white"
                                          title="Remove stop"
                                        >
                                          ×
                                        </button>
                                      )}
                                    </div>
                                    
                                    {/* Offset Slider */}
                                    <div>
                                      <div className="flex items-center justify-between mb-1">
                                        <label className="text-xs text-gray-300">Position</label>
                                        <span className="text-xs text-gray-300">{stop.offset}%</span>
                                      </div>
                                      <div className="flex gap-2 items-center">
                                        <input
                                          type="range"
                                          min="0"
                                          max="100"
                                          value={stop.offset}
                                          onChange={(e) => updateGradientStop(grad.id, index, { offset: parseFloat(e.target.value) || 0 })}
                                          className="flex-1"
                                        />
                                        <input
                                          type="number"
                                          min="0"
                                          max="100"
                                          value={stop.offset}
                                          onChange={(e) => updateGradientStop(grad.id, index, { offset: parseFloat(e.target.value) || 0 })}
                                          className="w-16 px-2 py-1 bg-gray-700 rounded text-white text-xs border border-gray-500"
                                        />
                                        <span className="text-xs text-gray-400">%</span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {gradients.length === 0 && (
                      <p className="text-xs text-gray-500 text-center">No gradients created</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Instructions */}
            <div className="mt-6 p-3 bg-gray-800 rounded-lg">
              <p className="text-sm text-gray-400">
                {tool === 'select' && 'Click on shapes to select them'}
                {tool === 'rect' && 'Click and drag to draw a rectangle'}
                {tool === 'circle' && 'Click and drag to draw a circle'}
                {tool === 'ellipse' && 'Click center and drag to draw an ellipse'}
                {tool === 'polygon' && `Set number of sides above, then click canvas to create a ${polygonSides}-sided polygon`}
                {tool === 'star' && `Configure star above, then click canvas to create a ${starPoints}-pointed star`}
                {tool === 'pen' && 'Click to add points. Hover over a point and drag to connect. Hold Shift while dragging for curves.'}
              </p>
            </div>

           

           
          </div>

          {/* Canvas */}
          <div className="flex-1 bg-gray-900 rounded-lg p-6">
            <div className="bg-white rounded-lg p-4 h-[600px] overflow-auto">
              <svg
                ref={canvasRef}
                width="100%"
                height="100%"
                viewBox="0 0 800 600"
                className="border border-gray-300 rounded"
                onClick={handleCanvasClick}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={(e) => {
                  handleMouseUp(e);
                  if (tool === 'pen') {
                    setHoveredPointIndex(null);
                  }
                }}
                style={{ cursor: tool === 'select' ? 'default' : tool === 'pen' && isConnectingPoints ? 'crosshair' : 'crosshair' }}
              >
                {/* Defs section for gradients */}
                <defs>
                  {gradients.map(grad => (
                    <linearGradient key={grad.id} id={grad.id} x1={grad.x1} y1={grad.y1} x2={grad.x2} y2={grad.y2}>
                      {grad.stops.map((stop, index) => (
                        <stop key={index} offset={`${stop.offset}%`} stopColor={stop.color} />
                      ))}
                    </linearGradient>
                  ))}
                </defs>

                {/* Render all shapes */}
                {shapes.map(shape => {
                  if (shape.type === 'rect' && shape.width && shape.height) {
                    return (
                      <rect
                        key={shape.id}
                        x={shape.x}
                        y={shape.y}
                        width={shape.width}
                        height={shape.height}
                        fill={shape.fillGradientId ? `url(#${shape.fillGradientId})` : shape.fill}
                        stroke={shape.strokeGradientId ? `url(#${shape.strokeGradientId})` : shape.stroke}
                        strokeWidth={shape.strokeWidth}
                        style={{
                          cursor: 'pointer',
                          outline: shape.selected ? '2px dashed #3B82F6' : 'none',
                          outlineOffset: '2px',
                        }}
                      />
                    );
                  }
                  if (shape.type === 'circle' && shape.cx !== undefined && shape.cy !== undefined && shape.r) {
                    return (
                      <circle
                        key={shape.id}
                        cx={shape.cx}
                        cy={shape.cy}
                        r={shape.r}
                        fill={shape.fillGradientId ? `url(#${shape.fillGradientId})` : shape.fill}
                        stroke={shape.strokeGradientId ? `url(#${shape.strokeGradientId})` : shape.stroke}
                        strokeWidth={shape.strokeWidth}
                        style={{
                          cursor: 'pointer',
                          outline: shape.selected ? '2px dashed #3B82F6' : 'none',
                          outlineOffset: '2px',
                        }}
                      />
                    );
                  }
                  if (shape.type === 'ellipse' && shape.cx !== undefined && shape.cy !== undefined && shape.rx !== undefined && shape.ry !== undefined) {
                    return (
                      <ellipse
                        key={shape.id}
                        cx={shape.cx}
                        cy={shape.cy}
                        rx={shape.rx}
                        ry={shape.ry}
                        fill={shape.fillGradientId ? `url(#${shape.fillGradientId})` : shape.fill}
                        stroke={shape.strokeGradientId ? `url(#${shape.strokeGradientId})` : shape.stroke}
                        strokeWidth={shape.strokeWidth}
                        style={{
                          cursor: 'pointer',
                          outline: shape.selected ? '2px dashed #3B82F6' : 'none',
                          outlineOffset: '2px',
                        }}
                      />
                    );
                  }
                  if (shape.type === 'polygon' && shape.points && shape.points.length >= 3) {
                    const pointsString = shape.points.map(p => `${p.x},${p.y}`).join(' ');
                    return (
                      <g key={shape.id}>
                        <polygon
                          points={pointsString}
                          fill={shape.fillGradientId ? `url(#${shape.fillGradientId})` : shape.fill}
                          stroke={shape.strokeGradientId ? `url(#${shape.strokeGradientId})` : shape.stroke}
                          strokeWidth={shape.strokeWidth}
                          style={{
                            cursor: 'pointer',
                            outline: shape.selected ? '2px dashed #3B82F6' : 'none',
                            outlineOffset: '2px',
                          }}
                        />
                        {/* Show vertex points when selected */}
                        {shape.selected && shape.points.map((point, index) => (
                          <circle
                            key={`vertex-${index}`}
                            cx={point.x}
                            cy={point.y}
                            r={5}
                            fill="#3B82F6"
                            stroke="#1E40AF"
                            strokeWidth={2}
                            style={{ cursor: 'move', pointerEvents: 'all' }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              setIsDraggingPolygonVertex({ shapeId: shape.id, vertexIndex: index });
                            }}
                          />
                        ))}
                      </g>
                    );
                  }
                  if (shape.type === 'path') {
                    const isCurrentPath = shape.id === currentPathId;
                    return (
                      <g key={shape.id}>
                        <path
                          ref={(el) => {
                            if (el) pathRefs.current.set(shape.id, el);
                            else pathRefs.current.delete(shape.id);
                          }}
                          d={shape.d}
                          fill={shape.fillGradientId ? `url(#${shape.fillGradientId})` : shape.fill}
                          stroke={shape.strokeGradientId ? `url(#${shape.strokeGradientId})` : shape.stroke}
                          strokeWidth={shape.strokeWidth}
                          style={{
                            cursor: 'pointer',
                            pointerEvents: 'visiblePainted',
                          }}
                        />
                        {/* Preview line when dragging from a point */}
                        {isConnectingPoints && draggingFromPoint?.shapeId === shape.id && previewLineEnd && (
                          <line
                            x1={draggingFromPoint.x}
                            y1={draggingFromPoint.y}
                            x2={previewLineEnd.x}
                            y2={previewLineEnd.y}
                            stroke={hoveredTargetPoint ? "#10B981" : "#60A5FA"}
                            strokeWidth={hoveredTargetPoint ? 3 : 2}
                            strokeDasharray={hoveredTargetPoint ? "0" : "5,5"}
                            opacity={0.7}
                            pointerEvents="none"
                          />
                        )}
                        {/* Render all M command points (when pen tool active or path selected) */}
                        {((tool === 'pen' && isCurrentPath) || shape.selected) && shape.commands.map((cmd, cmdIndex) => {
                          if (cmd.cmd === 'M') {
                            // Point (M command) - show with hover effect
                            const isHovered = hoveredPointIndex?.shapeId === shape.id && hoveredPointIndex?.cmdIndex === cmdIndex;
                            const isDraggingFrom = draggingFromPoint?.shapeId === shape.id && draggingFromPoint?.cmdIndex === cmdIndex;
                            const isTargetPoint = hoveredTargetPoint?.shapeId === shape.id && hoveredTargetPoint?.cmdIndex === cmdIndex;
                            
                            return (
                              <circle
                                key={`point-${cmdIndex}`}
                                cx={cmd.x}
                                cy={cmd.y}
                                r={isHovered || isDraggingFrom || isTargetPoint ? 8 : 6}
                                fill={isDraggingFrom ? "#FF6B6B" : isTargetPoint ? "#10B981" : isHovered ? "#60A5FA" : "#3B82F6"}
                                stroke={isDraggingFrom ? "#CC0000" : isTargetPoint ? "#059669" : "#1E40AF"}
                                strokeWidth={isDraggingFrom || isTargetPoint ? 3 : 2}
                                style={{ 
                                  cursor: tool === 'pen' && isCurrentPath ? 'grab' : 'move', 
                                  pointerEvents: 'all',
                                  transition: 'r 0.2s, fill 0.2s'
                                }}
                                onMouseEnter={() => {
                                  if (tool === 'pen' && isCurrentPath) {
                                    setHoveredPointIndex({ shapeId: shape.id, cmdIndex });
                                  }
                                }}
                                onMouseLeave={() => {
                                  if (tool === 'pen' && isCurrentPath) {
                                    setHoveredPointIndex(null);
                                  }
                                }}
                                onMouseDown={(e) => {
                                  if (tool === 'pen' && isCurrentPath) {
                                    e.stopPropagation();
                                    setDraggingFromPoint({
                                      shapeId: shape.id,
                                      cmdIndex,
                                      x: cmd.x!,
                                      y: cmd.y!
                                    });
                                    setIsConnectingPoints(true);
                                    const rect = canvasRef.current?.getBoundingClientRect();
                                    if (rect) {
                                      setPenDragStart({
                                        x: e.clientX - rect.left,
                                        y: e.clientY - rect.top
                                      });
                                    }
                                  } else {
                                    e.stopPropagation();
                                    startHandleDrag(shape.id, cmdIndex, 'anchor');
                                  }
                                }}
                              />
                            );
                          } else if (cmd.cmd === 'L') {
                            // Line segment - always show convert button when pen tool is active
                            
                            // Find start point for the line
                            let startX = 0;
                            let startY = 0;
                            for (let i = cmdIndex - 1; i >= 0; i--) {
                              const prevCmd = shape.commands[i];
                              if (prevCmd.cmd === 'M' || prevCmd.cmd === 'C' || prevCmd.cmd === 'L') {
                                if (prevCmd.cmd === 'M' || prevCmd.cmd === 'L') {
                                  startX = prevCmd.x!;
                                  startY = prevCmd.y!;
                                } else if (prevCmd.cmd === 'C') {
                                  startX = prevCmd.x!;
                                  startY = prevCmd.y!;
                                }
                                break;
                              }
                            }
                            
                            const midX = (startX + cmd.x!) / 2;
                            const midY = (startY + cmd.y!) / 2;
                            
                            return (
                              <g key={`line-${cmdIndex}`}>
                                {/* Line anchor point (when selected) */}
                                {shape.selected && (
                                  <circle
                                    cx={cmd.x}
                                    cy={cmd.y}
                                    r={5}
                                    fill="#3B82F6"
                                    stroke="#1E40AF"
                                    strokeWidth={2}
                                    style={{ cursor: 'move', pointerEvents: 'all' }}
                                    onMouseDown={(e) => {
                                      e.stopPropagation();
                                      startHandleDrag(shape.id, cmdIndex, 'anchor');
                                    }}
                                  />
                                )}
                                {/* Convert to curve button (always visible when pen tool is active) */}
                                {tool === 'pen' && isCurrentPath && !isConnectingPoints && (
                                  <g>
                                    {/* Background circle with shadow effect */}
                                    <circle
                                      cx={midX}
                                      cy={midY}
                                      r={14}
                                      fill="#000000"
                                      opacity={0.2}
                                      style={{ pointerEvents: 'none' }}
                                    />
                                    <circle
                                      cx={midX}
                                      cy={midY}
                                      r={12}
                                      fill="#10B981"
                                      stroke="#059669"
                                      strokeWidth={2}
                                      style={{ cursor: 'pointer', pointerEvents: 'all' }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        convertLineToCurve(shape.id, cmdIndex);
                                      }}
                                    />
                                    {/* Curve icon (simple SVG path) */}
                                    <path
                                      d={`M ${midX - 6} ${midY} Q ${midX} ${midY - 4} ${midX + 6} ${midY}`}
                                      stroke="white"
                                      strokeWidth={2.5}
                                      fill="none"
                                      style={{ pointerEvents: 'none' }}
                                    />
                                  </g>
                                )}
                              </g>
                            );
                          } else if (cmd.cmd === 'C') {
                            // Curve with control handles
                            return (
                              <g key={`curve-${cmdIndex}`}>
                                {/* Anchor point */}
                                <circle
                                  cx={cmd.x}
                                  cy={cmd.y}
                                  r={5}
                                  fill="#3B82F6"
                                  stroke="#1E40AF"
                                  strokeWidth={2}
                                  style={{ cursor: 'move', pointerEvents: 'all' }}
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    startHandleDrag(shape.id, cmdIndex, 'anchor');
                                  }}
                                />
                                {/* Control handle 1 */}
                                <g>
                                  <line
                                    x1={cmd.x1}
                                    y1={cmd.y1}
                                    x2={cmd.x!}
                                    y2={cmd.y!}
                                    stroke="#888"
                                    strokeWidth={1}
                                    strokeDasharray="3,3"
                                  />
                                  <circle
                                    cx={cmd.x1}
                                    cy={cmd.y1}
                                    r={4}
                                    fill="#FF6B6B"
                                    stroke="#CC0000"
                                    strokeWidth={1}
                                    style={{ cursor: 'move', pointerEvents: 'all' }}
                                    onMouseDown={(e) => {
                                      e.stopPropagation();
                                      startHandleDrag(shape.id, cmdIndex, 'handle1');
                                    }}
                                  />
                                </g>
                                {/* Control handle 2 */}
                                <g>
                                  <line
                                    x1={cmd.x2}
                                    y1={cmd.y2}
                                    x2={cmd.x!}
                                    y2={cmd.y!}
                                    stroke="#888"
                                    strokeWidth={1}
                                    strokeDasharray="3,3"
                                  />
                                  <circle
                                    cx={cmd.x2}
                                    cy={cmd.y2}
                                    r={4}
                                    fill="#4ECDC4"
                                    stroke="#006666"
                                    strokeWidth={1}
                                    style={{ cursor: 'move', pointerEvents: 'all' }}
                                    onMouseDown={(e) => {
                                      e.stopPropagation();
                                      startHandleDrag(shape.id, cmdIndex, 'handle2');
                                    }}
                                  />
                                </g>
                              </g>
                            );
                          }
                          return null;
                        })}
                      </g>
                    );
                  }
                  return null;
                })}
              </svg>
            </div>
          </div>

          {/* Properties Panel */}
          {selectedShape && (
            <div className="w-64 bg-gray-900 rounded-lg p-4">
              <h2 className="text-lg font-semibold mb-4">Properties</h2>
              
              <div className="space-y-4">
                {/* Fill Color */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Fill Color</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={selectedShape.fill}
                      onChange={(e) => updateShapeProperty('fill', e.target.value)}
                      className="w-12 h-10 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={selectedShape.fill}
                      onChange={(e) => updateShapeProperty('fill', e.target.value)}
                      className="flex-1 px-3 py-2 bg-gray-800 rounded text-white text-sm"
                    />
                  </div>
                </div>

                {/* Stroke Color */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Stroke Color</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={selectedShape.stroke}
                      onChange={(e) => updateShapeProperty('stroke', e.target.value)}
                      className="w-12 h-10 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={selectedShape.stroke}
                      onChange={(e) => updateShapeProperty('stroke', e.target.value)}
                      className="flex-1 px-3 py-2 bg-gray-800 rounded text-white text-sm"
                    />
                  </div>
                </div>

                {/* Stroke Width */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Stroke Width: {selectedShape.strokeWidth}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="0.5"
                    value={selectedShape.strokeWidth}
                    onChange={(e) => updateShapeProperty('strokeWidth', parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>

                {/* Fill Gradient Selection */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Fill Gradient</label>
                  <select
                    value={selectedShape.fillGradientId || ''}
                    onChange={(e) => updateShapeProperty('fillGradientId', e.target.value || undefined)}
                    className="w-full px-3 py-2 bg-gray-800 rounded text-white text-sm"
                  >
                    <option value="">None (Use Fill Color)</option>
                    {gradients.map(grad => (
                      <option key={grad.id} value={grad.id}>{grad.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Select a gradient to use for fill</p>
                </div>

                {/* Stroke Gradient Selection */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Stroke Gradient</label>
                  <select
                    value={selectedShape.strokeGradientId || ''}
                    onChange={(e) => updateShapeProperty('strokeGradientId', e.target.value || undefined)}
                    className="w-full px-3 py-2 bg-gray-800 rounded text-white text-sm"
                  >
                    <option value="">None (Use Stroke Color)</option>
                    {gradients.map(grad => (
                      <option key={grad.id} value={grad.id}>{grad.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Select a gradient to use for stroke</p>
                </div>

                {/* Path D Attribute Editor */}
                {selectedShape.type === 'path' && (
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Path Data (d)</label>
                    <textarea
                      value={selectedShape.d}
                      onChange={(e) => updatePathD(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-800 rounded text-white font-mono text-xs h-24 resize-none"
                      placeholder="M 100 100 L 200 200..."
                    />
                    {pathDError && (
                      <p className="text-red-400 text-xs mt-1">{pathDError}</p>
                    )}
                    <button
                      onClick={() => updatePathD(selectedShape.d)}
                      className="w-full mt-2 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                    >
                      Update Path
                    </button>
                  </div>
                )}

                {/* Position & Size (for rect) */}
                {selectedShape.type === 'rect' && (
                  <>
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">X</label>
                      <input
                        type="number"
                        value={selectedShape.x}
                        onChange={(e) => updateShapeProperty('x', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-gray-800 rounded text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Y</label>
                      <input
                        type="number"
                        value={selectedShape.y}
                        onChange={(e) => updateShapeProperty('y', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-gray-800 rounded text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Width</label>
                      <input
                        type="number"
                        value={selectedShape.width || 0}
                        onChange={(e) => updateShapeProperty('width', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-gray-800 rounded text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Height</label>
                      <input
                        type="number"
                        value={selectedShape.height || 0}
                        onChange={(e) => updateShapeProperty('height', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-gray-800 rounded text-white text-sm"
                      />
                    </div>
                  </>
                )}

                {/* Position & Radius (for circle) */}
                {selectedShape.type === 'circle' && (
                  <>
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Center X</label>
                      <input
                        type="number"
                        value={selectedShape.cx || 0}
                        onChange={(e) => updateShapeProperty('cx', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-gray-800 rounded text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Center Y</label>
                      <input
                        type="number"
                        value={selectedShape.cy || 0}
                        onChange={(e) => updateShapeProperty('cy', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-gray-800 rounded text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Radius</label>
                      <input
                        type="number"
                        value={selectedShape.r || 0}
                        onChange={(e) => updateShapeProperty('r', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-gray-800 rounded text-white text-sm"
                      />
                    </div>
                  </>
                )}

                {/* Position & Radii (for ellipse) */}
                {selectedShape.type === 'ellipse' && (
                  <>
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Center X</label>
                      <input
                        type="number"
                        value={selectedShape.cx || 0}
                        onChange={(e) => updateShapeProperty('cx', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-gray-800 rounded text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Center Y</label>
                      <input
                        type="number"
                        value={selectedShape.cy || 0}
                        onChange={(e) => updateShapeProperty('cy', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-gray-800 rounded text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">X Radius (rx)</label>
                      <input
                        type="number"
                        value={selectedShape.rx || 0}
                        onChange={(e) => updateShapeProperty('rx', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-gray-800 rounded text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Y Radius (ry)</label>
                      <input
                        type="number"
                        value={selectedShape.ry || 0}
                        onChange={(e) => updateShapeProperty('ry', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-gray-800 rounded text-white text-sm"
                      />
                    </div>
                  </>
                )}

                {/* Points (for polygon) */}
                {selectedShape.type === 'polygon' && (
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      Vertices ({selectedShape.points.length} points)
                    </label>
                    <div className="max-h-48 overflow-y-auto space-y-2">
                      {selectedShape.points.map((point, index) => (
                        <div key={index} className="flex gap-2 items-center">
                          <span className="text-xs text-gray-500 w-6">{index + 1}</span>
                          <input
                            type="number"
                            value={Math.round(point.x)}
                            onChange={(e) => {
                              const newX = parseFloat(e.target.value) || 0;
                              setShapes(prev => prev.map(s => {
                                if (s.id === selectedShapeId && s.type === 'polygon') {
                                  const newPoints = [...s.points];
                                  newPoints[index] = { ...newPoints[index], x: newX };
                                  return { ...s, points: newPoints };
                                }
                                return s;
                              }));
                            }}
                            className="flex-1 px-2 py-1 bg-gray-800 rounded text-white text-xs"
                            placeholder="X"
                          />
                          <input
                            type="number"
                            value={Math.round(point.y)}
                            onChange={(e) => {
                              const newY = parseFloat(e.target.value) || 0;
                              setShapes(prev => prev.map(s => {
                                if (s.id === selectedShapeId && s.type === 'polygon') {
                                  const newPoints = [...s.points];
                                  newPoints[index] = { ...newPoints[index], y: newY };
                                  return { ...s, points: newPoints };
                                }
                                return s;
                              }));
                            }}
                            className="flex-1 px-2 py-1 bg-gray-800 rounded text-white text-xs"
                            placeholder="Y"
                          />
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Edit vertex coordinates above. Drag vertices on canvas when selected.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
