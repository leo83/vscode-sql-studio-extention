import { describe, expect, it } from "vitest";
import { buildGraph } from "./buildGraph";
import { layoutGraph } from "./layout";
import { parseDbml } from "./parseDbml";

const SAMPLE_DBML = `
Table public.users {
  id int [pk, not null]
  username varchar
}

Table public.posts {
  id int [pk, not null]
  user_id int [not null, ref: > public.users.id]
}
`;

describe("parseDbml", () => {
  it("parses tables and column-level relationships", () => {
    const schema = parseDbml(SAMPLE_DBML);
    expect(schema.tables).toHaveLength(2);
    expect(schema.relationships).toHaveLength(1);
    expect(schema.relationships[0]).toMatchObject({
      fromTableId: "public.posts",
      fromColumn: "user_id",
      toTableId: "public.users",
      toColumn: "id",
    });
  });

  it("marks foreign key columns", () => {
    const schema = parseDbml(SAMPLE_DBML);
    const posts = schema.tables.find((table) => table.id === "public.posts");
    const userId = posts?.columns.find((column) => column.name === "user_id");
    expect(userId?.isFk).toBe(true);
  });
});

describe("buildGraph", () => {
  it("binds edges to column handles", () => {
    const schema = parseDbml(SAMPLE_DBML);
    const { nodes, edges } = buildGraph(schema);
    expect(nodes).toHaveLength(2);
    expect(edges).toHaveLength(1);
    expect(edges[0]?.sourceHandle).toBe("public.posts::user_id-right");
    expect(edges[0]?.targetHandle).toBe("public.users::id-left");
  });
});

describe("layoutGraph", () => {
  it("places parent tables above child tables", () => {
    const schema = parseDbml(SAMPLE_DBML);
    const { nodes, edges } = buildGraph(schema);
    const layout = layoutGraph(nodes, edges);
    const users = layout.find((node) => node.id === "public.users");
    const posts = layout.find((node) => node.id === "public.posts");
    expect(users).toBeDefined();
    expect(posts).toBeDefined();
    expect(users!.position.y).toBeLessThan(posts!.position.y);
  });
});
