// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  test("ステータスの日本語ラベルを出す", () => {
    render(<StatusBadge status="changes_requested" />);
    expect(screen.getByText("修正依頼")).toBeInTheDocument();
  });
});
