// Same function, way 1: two multipliers, then pick one result.
module share_two_muls (
  input  logic        sel,
  input  logic [15:0] a, b, c,
  output logic [31:0] y
);
  assign y = sel ? (a * b) : (a * c);
endmodule
