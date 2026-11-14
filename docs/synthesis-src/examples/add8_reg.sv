// A registered 8-bit adder: flip-flops on the inputs and on the sum, so the adder sits
// between two registers (a register-to-register timing path, the kind report_timing shows).
module add8_reg (
  input  logic       clk,
  input  logic [7:0] a, b,
  output logic [8:0] s
);
  logic [7:0] a_q, b_q;
  always_ff @(posedge clk) begin
    a_q <= a;
    b_q <= b;
    s   <= a_q + b_q;        // 9-bit result keeps the carry
  end
endmodule
