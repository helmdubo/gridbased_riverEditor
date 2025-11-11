/**
 * GraphService - Adapter for core graph operations
 *
 * This service provides a thin wrapper around core/graph/operations.
 * It's the bridge between React UI layer and the pure core logic.
 *
 * All methods return new graph instances (immutable operations).
 */

import type { RiverGraphV2, NodeId, EdgeId, Width, FlowSign } from '@/core/graph/types';
import { makeWidthAbs, makeWidthRel } from '@/core/graph/types';
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
   * Creates a new edge (main river or tributary)
   */
  static createEdge(
    graph: RiverGraphV2,
    kind: 'main' | 'tributary',
    nodeIds: NodeId[],
    width: Width,
    flowSign: FlowSign = 1
  ) {
    return graphOps.createEdge(graph, kind, nodeIds, width, flowSign);
  }

  /**
   * Creates a main river edge with absolute width
   */
  static createMainRiver(
    graph: RiverGraphV2,
    nodeIds: NodeId[],
    widthPixels: number
  ) {
    const width = makeWidthAbs(widthPixels);
    return graphOps.createEdge(graph, 'main', nodeIds, width, 1);
  }

  /**
   * Creates a tributary edge with relative width
   */
  static createTributary(
    graph: RiverGraphV2,
    nodeIds: NodeId[],
    widthPercent: number
  ) {
    const width = makeWidthRel(widthPercent);
    return graphOps.createEdge(graph, 'tributary', nodeIds, width, 1);
  }

  /**
   * Splits an edge by inserting a new node
   */
  static splitEdge(
    graph: RiverGraphV2,
    edgeId: EdgeId,
    newNodeId: NodeId,
    atIndex: number
  ): RiverGraphV2 {
    return graphOps.splitEdge(graph, edgeId, newNodeId, atIndex);
  }

  /**
   * Deletes an edge from the graph
   */
  static deleteEdge(graph: RiverGraphV2, edgeId: EdgeId): RiverGraphV2 {
    return graphOps.deleteEdge(graph, edgeId);
  }

  /**
   * Attaches a detached tributary to a junction node
   */
  static attachTributary(
    graph: RiverGraphV2,
    tribEdgeId: EdgeId,
    junctionNodeId: NodeId
  ): RiverGraphV2 {
    return graphOps.attachTributary(graph, tribEdgeId, junctionNodeId);
  }

  /**
   * Detaches a tributary from its junction
   */
  static detachTributary(
    graph: RiverGraphV2,
    tribEdgeId: EdgeId,
    createNewMouthNode: boolean = false
  ) {
    return graphOps.detachTributary(graph, tribEdgeId, createNewMouthNode);
  }

  /**
   * Updates the width of an edge
   */
  static updateEdgeWidth(
    graph: RiverGraphV2,
    edgeId: EdgeId,
    width: Width
  ): RiverGraphV2 {
    return graphOps.updateEdgeWidth(graph, edgeId, width);
  }

  /**
   * Updates the flow sign of an edge
   */
  static updateFlowSign(
    graph: RiverGraphV2,
    edgeId: EdgeId,
    flowSign: FlowSign
  ): RiverGraphV2 {
    return graphOps.updateFlowSign(graph, edgeId, flowSign);
  }

  /**
   * Validates the entire graph
   */
  static isValidGraph(graph: RiverGraphV2) {
    return graphValidation.isValidGraph(graph);
  }

  /**
   * Checks if a node is a junction (connected to 2+ edges)
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
   * Gets all edges connected to a node
   */
  static getConnectedEdges(graph: RiverGraphV2, nodeId: NodeId): EdgeId[] {
    return graphValidation.getConnectedEdges(graph, nodeId);
  }

  /**
   * Gets the main edge from the graph
   */
  static getMainEdge(graph: RiverGraphV2) {
    if (graph.mainEdgeId === null) return null;
    return graph.edges[graph.mainEdgeId] || null;
  }

  /**
   * Gets all tributary edges
   */
  static getTributaries(graph: RiverGraphV2) {
    return Object.values(graph.edges).filter((edge) => edge.kind === 'tributary');
  }

  /**
   * Gets all detached tributaries
   */
  static getDetachedTributaries(graph: RiverGraphV2) {
    return Object.values(graph.edges).filter(
      (edge) => edge.kind === 'tributary' && edge.isDetached
    );
  }

  /**
   * Gets all attached tributaries
   */
  static getAttachedTributaries(graph: RiverGraphV2) {
    return Object.values(graph.edges).filter(
      (edge) => edge.kind === 'tributary' && !edge.isDetached
    );
  }

  /**
   * Gets a node by ID
   */
  static getNode(graph: RiverGraphV2, nodeId: NodeId) {
    return graph.nodes[nodeId] || null;
  }

  /**
   * Gets an edge by ID
   */
  static getEdge(graph: RiverGraphV2, edgeId: EdgeId) {
    return graph.edges[edgeId] || null;
  }

  /**
   * Gets all nodes in the graph
   */
  static getAllNodes(graph: RiverGraphV2) {
    return Object.values(graph.nodes);
  }

  /**
   * Gets all edges in the graph
   */
  static getAllEdges(graph: RiverGraphV2) {
    return Object.values(graph.edges);
  }

  /**
   * Checks if the graph has a main river
   */
  static hasMainRiver(graph: RiverGraphV2): boolean {
    return graph.mainEdgeId !== null && !!graph.edges[graph.mainEdgeId];
  }

  /**
   * Gets the number of nodes in an edge
   */
  static getEdgeNodeCount(graph: RiverGraphV2, edgeId: EdgeId): number {
    const edge = graph.edges[edgeId];
    return edge ? edge.nodeIds.length : 0;
  }

  /**
   * Gets node positions for an edge
   */
  static getEdgeNodePositions(graph: RiverGraphV2, edgeId: EdgeId) {
    const edge = graph.edges[edgeId];
    if (!edge) return [];

    return edge.nodeIds.map((nodeId) => {
      const node = graph.nodes[nodeId];
      return node ? { x: node.x, y: node.y } : { x: 0, y: 0 };
    });
  }

  /**
   * Adds a node to the end of an edge
   *
   * @param graph - Current graph
   * @param edgeId - Edge to extend
   * @param x - X coordinate of new node
   * @param y - Y coordinate of new node
   * @returns Updated graph and new node ID
   */
  static addNodeToEdge(graph: RiverGraphV2, edgeId: EdgeId, x: number, y: number) {
    const edge = graph.edges[edgeId];
    if (!edge) {
      throw new Error(`Edge ${edgeId} not found`);
    }

    // Add new node
    const { graph: graphWithNode, nodeId } = graphOps.addNode(graph, x, y);

    // Add node to edge's nodeIds
    const updatedEdge = {
      ...edge,
      nodeIds: [...edge.nodeIds, nodeId as string],
    };

    const finalGraph = {
      ...graphWithNode,
      edges: {
        ...graphWithNode.edges,
        [edgeId]: updatedEdge,
      },
    };

    return { graph: finalGraph, nodeId };
  }

  /**
   * Inserts a node into an edge after a specific node
   *
   * @param graph - Current graph
   * @param edgeId - Edge to modify
   * @param afterNodeId - Node after which to insert
   * @param x - X coordinate of new node
   * @param y - Y coordinate of new node
   * @returns Updated graph and new node ID
   */
  static insertNodeAfter(
    graph: RiverGraphV2,
    edgeId: EdgeId,
    afterNodeId: NodeId,
    x: number,
    y: number
  ) {
    const edge = graph.edges[edgeId];
    if (!edge) {
      throw new Error(`Edge ${edgeId} not found`);
    }

    const afterIndex = edge.nodeIds.indexOf(afterNodeId as string);
    if (afterIndex === -1) {
      throw new Error(`Node ${afterNodeId} not found in edge ${edgeId}`);
    }

    // Add new node
    const { graph: graphWithNode, nodeId } = graphOps.addNode(graph, x, y);

    // Insert node into edge's nodeIds
    const newNodeIds = [...edge.nodeIds];
    newNodeIds.splice(afterIndex + 1, 0, nodeId as string);

    const updatedEdge = {
      ...edge,
      nodeIds: newNodeIds,
    };

    const finalGraph = {
      ...graphWithNode,
      edges: {
        ...graphWithNode.edges,
        [edgeId]: updatedEdge,
      },
    };

    return { graph: finalGraph, nodeId };
  }

  /**
   * Creates a new tributary starting from a junction node
   *
   * @param graph - Current graph
   * @param junctionNodeId - Node where tributary starts
   * @param x - X coordinate of first tributary node
   * @param y - Y coordinate of first tributary node
   * @param widthPercent - Width as percentage of main river
   * @returns Updated graph and new tributary edge ID
   */
  static createTributaryFromJunction(
    graph: RiverGraphV2,
    junctionNodeId: NodeId,
    x: number,
    y: number,
    widthPercent: number
  ) {
    // Add new node for tributary
    const { graph: graphWithNode, nodeId: newNodeId } = graphOps.addNode(graph, x, y);

    // Create tributary edge (starts detached, we'll attach it immediately)
    const width = makeWidthRel(widthPercent);
    const { graph: graphWithEdge, edgeId: tribEdgeId } = graphOps.createEdge(
      graphWithNode,
      'tributary',
      [junctionNodeId, newNodeId],
      width,
      1
    );

    // Attach tributary to junction
    const finalGraph = graphOps.attachTributary(graphWithEdge, tribEdgeId, junctionNodeId);

    return { graph: finalGraph, tributaryId: tribEdgeId, newNodeId };
  }
}

export default GraphService;
