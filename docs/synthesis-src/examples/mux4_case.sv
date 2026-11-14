// A 4:1 multiplexer written as a case statement, 8 bits wide.
module mux4_case (
  input  logic [1:0] sel,
  input  logic [7:0] a, b, c, d,
  output logic [7:0] y
);
  always_comb begin
    case (sel)
      2'd0:    y = a;
      2'd1:    y = b;
      2'd2:    y = c;
      default: y = d;     // covers 2'd3, so y is assigned on every path
    endcase
  end
endmodule
