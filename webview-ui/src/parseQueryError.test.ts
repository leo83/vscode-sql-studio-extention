import { describe, expect, it } from "vitest";
import { parseQueryError } from "./parseQueryError";

describe("parseQueryError", () => {
  it("parses clickhouse error with stack trace and removes trailing Stack trace phrase", () => {
    const rawError = `Code: 47. DB::Exception: Unknown expression or function identifier 'f.service_booked' in scope SELECT lower(arrayElement(splitByString('@', coalesce(sender, '')), 2)) AS sender_domain, (sum(sign(((((confirmed_by_agent + f.service_booked) + f.service_booked_awaiting_documents) + f.service_booked_has_documents) + f.reservation_sending_to_client) + f.sending_booking_documents_to_client)) / sum(is_initial)) * 100 AS Success FROM robotisation.mv_ai_agent_fop_funnel WHERE sender_domain IN ('jinr.ru', 'uralchem.com') GROUP BY sender_domain ORDER BY Success DESC. Stack trace:

0. DB::Exception::Exception(std::__1::basic_string<char, std::__1::char_traits<char>, std::__1::allocator<char> > const&, int, bool) @ 0x000000000bd93325 in /usr/bin/clickhouse
1. DB::ExpressionActions::ExpressionActions(std::__1::shared_ptr<DB::ExpressionActionsPrivate> const&, DB::Context const&) @ 0x000000000c012345 in /usr/bin/clickhouse`;

    const parsed = parseQueryError(rawError);

    expect(parsed.code).toBe("47");
    expect(parsed.summary).not.toContain("Stack trace:");
    expect(parsed.summary).toBe("Unknown expression or function identifier 'f.service_booked' in scope SELECT lower(arrayElement(splitByString('@', coalesce(sender, '')), 2)) AS sender_domain, (sum(sign(((((confirmed_by_agent + f.service_booked) + f.service_booked_awaiting_documents) + f.service_booked_has_documents) + f.reservation_sending_to_client) + f.sending_booking_documents_to_client)) / sum(is_initial)) * 100 AS Success FROM robotisation.mv_ai_agent_fop_funnel WHERE sender_domain IN ('jinr.ru', 'uralchem.com') GROUP BY sender_domain ORDER BY Success DESC");
    expect(parsed.message).not.toContain("Stack trace:");
    expect(parsed.message).toBe("Code: 47. DB::Exception: Unknown expression or function identifier 'f.service_booked' in scope SELECT lower(arrayElement(splitByString('@', coalesce(sender, '')), 2)) AS sender_domain, (sum(sign(((((confirmed_by_agent + f.service_booked) + f.service_booked_awaiting_documents) + f.service_booked_has_documents) + f.reservation_sending_to_client) + f.sending_booking_documents_to_client)) / sum(is_initial)) * 100 AS Success FROM robotisation.mv_ai_agent_fop_funnel WHERE sender_domain IN ('jinr.ru', 'uralchem.com') GROUP BY sender_domain ORDER BY Success DESC");
    expect(parsed.stackTrace).toContain("0. DB::Exception::Exception");
    expect(parsed.stackTrace).toContain("1. DB::ExpressionActions::ExpressionActions");
  });

  it("handles error without stack trace", () => {
    const rawError = "Code: 47. DB::Exception: Unknown expression or function identifier 'f.service_booked' in scope SELECT 1";
    const parsed = parseQueryError(rawError);

    expect(parsed.code).toBe("47");
    expect(parsed.summary).toBe("Unknown expression or function identifier 'f.service_booked' in scope SELECT 1");
    expect(parsed.message).toBe("Code: 47. DB::Exception: Unknown expression or function identifier 'f.service_booked' in scope SELECT 1");
    expect(parsed.stackTrace).toBeNull();
  });
});
