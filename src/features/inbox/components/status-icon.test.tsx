// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusIcon } from "./status-icon";

describe("StatusIcon", () => {
  it("shows YCloud's failure code and message without exposing credentials", () => {
    render(
      <StatusIcon
        status="failed"
        meta={{
          ycloud_error_code: "131026",
          ycloud_error_message: "Message undeliverable",
        }}
      />,
    );

    const icon = screen.getByLabelText(
      "Fallido (131026): Message undeliverable",
    );
    expect(icon.getAttribute("title")).toBe(
      "Fallido (131026): Message undeliverable",
    );
  });

  it("keeps a useful fallback when the provider sent no detail", () => {
    render(<StatusIcon status="failed" meta={{}} />);

    expect(
      screen.getByLabelText(
        "Fallido. Consulta el estado del mensaje en YCloud.",
      ),
    ).toBeTruthy();
  });
});
