/**
 * GraphService - Adapter for core graph operations
 *
 * This service provides a thin wrapper around core/graph/operations.
 * It's the bridge between React UI layer and the pure core logic.
 *
 * All methods return new graph instances (immutable operations).
 */

import type { RiverGraphV2, NodeId, SplineId, Width, SplineKind } from '@/core/graph/types';
import { makeWidthPx, makeWidthRelative } from '@/core/graph/types';
import * as graphOps from '@/core/graph/operations';
import * as graphValidation from '@/core/graph/validation';

/**
 * GraphService class
 *
 * Provides methods for graph manipulation that can be called from React hooks.
 */
export class GraphService {
  /**
   * Creates an empty river graph
   */
  static createEmpty(): RiverGraphV2 {
    return graphOps.createEmptyGraph();
  }

  /**
   * Adds a new node at the specified position
   */
  static addNode(graph: RiverGraphV2, x: number, y: number) {
    return graphOps.addNode(graph, x, y);
  }

  /**
   * Deletes a node from the graph
   */
  static deleteNode(graph: RiverGraphV2, nodeId: NodeId): RiverGraphV2 {
    return graphOps.deleteNode(graph, nodeId);
  }

  /**
   * Moves a node to a new position
   */
  static moveNode(
    graph: RiverGraphV2,
    nodeId: NodeId,
    x: number,
    y: number
  ): RiverGraphV2 {
    return graphOps.moveNode(graph, nodeId, x, y);
  }

  /**
   * Creates a new spline (river or tributary)
   */
  static createSpline(
    graph: RiverGraphV2,
    kind: SplineKind,
    nodeIds: NodeId[],
    width: Width
  ) {
    return graphOps.createSpline(graph, kind, nodeIds, width);
  }

  /**
   * Creates a main river spline with absolute width in pixels
   */
  static createMainRiver(
    graph: RiverGraphV2,
    nodeIds: NodeId[],
    widthPixels: number
  ) {
    const width = makeWidthPx(widthPixels);
    return graphOps.createSpline(graph, 'river', nodeIds, width);
  }

  /**
   * Creates a tributary spline with relative width (percentage)
   */
  static createTributary(
    graph: RiverGraphV2,
    nodeIds: NodeId[],
    widthPercent: number
  ) {
    const width = makeWidthRelative(widthPercent);
    return graphOps.createSpline(graph, 'tributary', nodeIds, width);
  }

  /**
   * Splits an spline by inserting a new node
   */
  static splitSpline(
    graph: RiverGraphV2,
    splineId: SplineId,
    newNodeId: NodeId,
    atIndex: number
  ): RiverGraphV2 {
    return graphOps.splitSpline(graph, splineId, newNodeId, atIndex);
  }

  /**
   * Deletes an spline from the graph
   */
  static deleteSpline(graph: RiverGraphV2, splineId: SplineId): RiverGraphV2 {
    return graphOps.deleteSpline(graph, splineId);
  }

  /**
   * Attaches a detached tributary to a junction node
   */
  static attachTributary(
    graph: RiverGraphV2,
    tribSplineId: SplineId,
    parentSplineId: SplineId,
    junctionNodeId: NodeId
  ): RiverGraphV2 {
    return graphOps.attachTributary(graph, tribSplineId, parentSplineId, junctionNodeId);
  }

  /**
   * Detaches a tributary from its junction
   */
  static detachTributary(
    graph: RiverGraphV2,
    tribSplineId: SplineId,
    createNewMouthNode: boolean = false
  ) {
    return graphOps.detachTributary(graph, tribSplineId, createNewMouthNode);
  }

  /**
   * Updates the width of an spline
   */
  static updateSplineWidth(
    graph: RiverGraphV2,
    splineId: SplineId,
    width: Width
  ): RiverGraphV2 {
    return graphOps.updateSplineWidth(graph, splineId, width);
  }

  /**
   * Reverses the direction of an spline
   */
  static reverseSpline(graph: RiverGraphV2, splineId: SplineId): RiverGraphV2 {
    return graphOps.reverseSpline(graph, splineId);
  }

  /**
   * Extends an spline upstream (adds node at source end)
   */
  static extendUpstream(graph: RiverGraphV2, splineId: SplineId, x: number, y: number) {
    return graphOps.extendUpstream(graph, splineId, x, y);
  }

  /**
   * Extends an spline downstream (adds node at mouth end)
   */
  static extendDownstream(graph: RiverGraphV2, splineId: SplineId, x: number, y: number) {
    return graphOps.extendDownstream(graph, splineId, x, y);
  }

  /**
   * Inserts a node between two existing nodes
   */
  static insertBetween(graph: RiverGraphV2, splineId: SplineId, afterIndex: number, x: number, y: number) {
    return graphOps.insertBetween(graph, splineId, afterIndex, x, y);
  }

  /**
   * Validates the entire graph
   */
  static isValidGraph(graph: RiverGraphV2) {
    return graphValidation.isValidGraph(graph);
  }

  /**
   * Checks if a node is a junction (connected to 2+ splines)
   */
  static isJunctionNode(graph: RiverGraphV2, nodeId: NodeId): boolean {
    return graphValidation.isJunctionNode(graph, nodeId);
  }

  /**
   * Checks if a tributary can be attached to a specific node
   */
  static canAttachToNode(graph: RiverGraphV2, nodeId: NodeId) {
    return graphValidation.canAttachToNode(graph, nodeId);
  }

  /**
   * Finds all junction nodes in the graph
   */
  static findJunctionNodes(graph: RiverGraphV2): NodeId[] {
    return graphValidation.findJunctionNodes(graph);
  }

  /**
   * Gets all splines connected to a node
   */
  static getConnectedSplines(graph: RiverGraphV2, nodeId: NodeId): SplineId[] {
    return graphValidation.getConnectedSplines(graph, nodeId);
  }

  /**
   * Gets the main spline from the graph
   */
  static getMainSpline(graph: RiverGraphV2) {
    if (graph.mainSplineId === null) return null;
    return graph.splines[graph.mainSplineId] || null;
  }

  /**
   * Gets all tributary splines
   */
  static getTributaries(graph: RiverGraphV2) {
    return Object.values(graph.splines).filter((spline) => spline.kind === 'tributary');
  }

  /**
   * Gets all detached tributaries (tributaries not attached to parent)
   * Note: With new model, detached = parentId === null
   */
  static getDetachedTributaries(graph: RiverGraphV2) {
    return Object.values(graph.splines).filter(
      (spline) => spline.kind === 'tributary' && spline.parentId === null
    );
  }

  /**
   * Gets all attached tributaries (tributaries attached to parent)
   */
  static getAttachedTributaries(graph: RiverGraphV2) {
    return Object.values(graph.splines).filter(
      (spline) => spline.kind === 'tributary' && spline.parentId !== null
    );
  }

  /**
   * Gets a node by ID
   */
  static getNode(graph: RiverGraphV2, nodeId: NodeId) {
    return graph.nodes[nodeId] || null;
  }

  /**
   * Gets an spline by ID
   */
  static getSpline(graph: RiverGraphV2, splineId: SplineId) {
    return graph.splines[splineId] || null;
  }

  /**
   * Gets all nodes in the graph
   */
  static getAllNodes(graph: RiverGraphV2) {
    return Object.values(graph.nodes);
  }

  /**
   * Gets all splines in the graph
   */
  static getAllSplines(graph: RiverGraphV2) {
    return Object.values(graph.splines);
  }

  /**
   * Checks if the graph has a main river
   */
  static hasMainRiver(graph: RiverGraphV2): boolean {
    return graph.mainSplineId !== null && !!graph.splines[graph.mainSplineId];
  }

  /**
   * Gets the number of nodes in an spline
   */
  static getSplineNodeCount(graph: RiverGraphV2, splineId: SplineId): number {
    const spline = graph.splines[splineId];
    return spline ? spline.nodeIds.length : 0;
  }

  /**
   * Gets node positions for an spline
   */
  static getSplineNodePositions(graph: RiverGraphV2, splineId: SplineId) {
    const spline = graph.splines[splineId];
    if (!spline) return [];

    return spline.nodeIds.map((nodeId) => {
      const node = graph.nodes[nodeId];
      return node ? { x: node.x, y: node.y } : { x: 0, y: 0 };
    });
  }

  /**
   * Adds a node to the end of an spline
   *
   * @param graph - Current graph
   * @param splineId - Spline to extend
   * @param x - X coordinate of new node
   * @param y - Y coordinate of new node
   * @returns Updated graph and new node ID
   */
  static addNodeToSpline(graph: RiverGraphV2, splineId: SplineId, x: number, y: number) {
    const spline = graph.splines[splineId];
    if (!spline) {
      throw new Error(`Spline ${splineId} not found`);
    }

    // Add new node
    const { graph: graphWithNode, nodeId } = graphOps.addNode(graph, x, y);

    // Add node to spline's nodeIds
    const updatedEdge = {
      ...spline,
      nodeIds: [...spline.nodeIds, nodeId as string],
    };

    const finalGraph = {
      ...graphWithNode,
      splines: {
        ...graphWithNode.splines,
        [splineId]: updatedEdge,
      },
    };

    return { graph: finalGraph, nodeId };
  }

  /**
   * Inserts a node into an spline after a specific node
   *
   * @param graph - Current graph
   * @param splineId - Spline to modify
   * @param afterNodeId - Node after which to insert
   * @param x - X coordinate of new node
   * @param y - Y coordinate of new node
   * @returns Updated graph and new node ID
   */
  static insertNodeAfter(
    graph: RiverGraphV2,
    splineId: SplineId,
    afterNodeId: NodeId,
    x: number,
    y: number
  ) {
    const spline = graph.splines[splineId];
    if (!spline) {
      throw new Error(`Spline ${splineId} not found`);
    }

    const afterIndex = spline.nodeIds.indexOf(afterNodeId as string);
    if (afterIndex === -1) {
      throw new Error(`Node ${afterNodeId} not found in spline ${splineId}`);
    }

    // Add new node
    const { graph: graphWithNode, nodeId } = graphOps.addNode(graph, x, y);

    // Insert node into spline's nodeIds
    const newNodeIds = [...spline.nodeIds];
    newNodeIds.splice(afterIndex + 1, 0, nodeId as string);

    const updatedEdge = {
      ...spline,
      nodeIds: newNodeIds,
    };

    const finalGraph = {
      ...graphWithNode,
      splines: {
        ...graphWithNode.splines,
        [splineId]: updatedEdge,
      },
    };

    return { graph: finalGraph, nodeId };
  }

  /**
   * Creates a new tributary starting from a junction node on the main river
   *
   * @param graph - Current graph
   * @param parentSplineId - Parent river spline ID (usually mainSplineId)
   * @param junctionNodeId - Node where tributary joins parent
   * @param x - X coordinate of first tributary node (source)
   * @param y - Y coordinate of first tributary node (source)
   * @param widthPercent - Width as percentage of parent river
   * @returns Updated graph, new tributary spline ID, and new node ID
   */
  static createTributaryFromJunction(
    graph: RiverGraphV2,
    parentSplineId: SplineId,
    junctionNodeId: NodeId,
    x: number,
    y: number,
    widthPercent: number
  ) {
    // Add new node for tributary source
    const { graph: graphWithNode, nodeId: newNodeId } = graphOps.addNode(graph, x, y);

    // Create independent river spline (will be converted to tributary on attach)
    // nodeIds: [source, mouth] where mouth will be set to junction on attach
    const width = makeWidthRelative(widthPercent);
    const { graph: graphWithEdge, splineId: tribSplineId } = graphOps.createSpline(
      graphWithNode,
      'river', // Start as river, will become tributary on attach
      [newNodeId, newNodeId], // Temporary: will be updated to [newNodeId, junctionNodeId]
      width
    );

    // Attach tributary to parent at junction
    const finalGraph = graphOps.attachTributary(
      graphWithEdge,
      tribSplineId,
      parentSplineId,
      junctionNodeId
    );

    return { graph: finalGraph, tributaryId: tribSplineId, newNodeId };
  }

  /**
   * Merges two nodes in the same spline
   *
   * @param graph - Current graph
   * @param draggedNodeId - Node being dragged
   * @param targetNodeId - Node being dropped onto
   * @param survivorNodeId - ID of node that survives (from nodeKinds.getMergeSurvivor)
   * @returns Updated graph with nodes merged
   */
  static mergeNodes(
    graph: RiverGraphV2,
    draggedNodeId: NodeId,
    targetNodeId: NodeId,
    survivorNodeId: NodeId
  ): RiverGraphV2 {
    return graphOps.mergeNodes(graph, draggedNodeId, targetNodeId, survivorNodeId);
  }
}

export default GraphService;
