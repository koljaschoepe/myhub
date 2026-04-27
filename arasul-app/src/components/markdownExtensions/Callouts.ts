import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const CALLOUT_RE = /^\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]/i;

/**
 * GitHub-style callouts.
 *
 * Renders any blockquote whose first paragraph begins with `[!TYPE]` as
 * a styled callout. No schema change — we attach a node decoration so
 * markdown round-trips losslessly through tiptap-markdown.
 *
 *   > [!NOTE] heads up
 *   > [!WARNING] don't do this
 *   > [!TIP] try this instead
 *   > [!IMPORTANT] read me
 *   > [!CAUTION] danger
 */
export const Callouts = Extension.create({
  name: "callouts",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("callouts"),
        props: {
          decorations(state) {
            const decos: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name !== "blockquote") return true;
              const firstPara = node.firstChild;
              if (!firstPara) return false;
              const firstText = firstPara.firstChild?.text ?? "";
              const m = firstText.match(CALLOUT_RE);
              if (!m) return false;
              const kind = m[1].toLowerCase();
              decos.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  class: `arasul-callout arasul-callout-${kind}`,
                  "data-callout": kind,
                })
              );
              return false;
            });
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});
