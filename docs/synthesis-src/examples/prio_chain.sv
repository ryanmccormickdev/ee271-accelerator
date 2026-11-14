// Way 1: an if / else-if chain. Each condition is tested only if all earlier ones failed,
// so synthesis builds a chain of 2:1 muxes (a priority encoder).
module prio_chain (
  input  logic [7:0]  req,
  input  logic [15:0] d0, d1, d2, d3, d4, d5, d6, d7,
  output logic [15:0] y
);
  always_comb begin
    if      (req[0]) y = d0;
    else if (req[1]) y = d1;
    else if (req[2]) y = d2;
    else if (req[3]) y = d3;
    else if (req[4]) y = d4;
    else if (req[5]) y = d5;
    else if (req[6]) y = d6;
    else if (req[7]) y = d7;
    else             y = '0;
  end
endmodule
